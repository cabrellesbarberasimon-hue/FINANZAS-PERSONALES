import { z } from "zod";
import {
  ACCOUNT_TYPES,
  balanceMethod,
  computeBalance,
  latestDeclared,
  reconcile,
  type AccountType,
  type BalanceMethod,
  type ReconciliationRow,
} from "@/domain/accounts";
import type { Account, AccountBalance } from "@/generated/prisma/client";
import { inTransaction, isUniqueViolation, UserError, writeAudit, type Db } from "./common";

// -----------------------------------------------------------------------------
// Validación
// -----------------------------------------------------------------------------

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  institution: z.string().trim().max(80).optional().transform((v) => v || null),
  type: z.enum(ACCOUNT_TYPES as [AccountType, ...AccountType[]]),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Moneda ISO de 3 letras (EUR, USD...)")
    .default("EUR"),
  identifier: z.string().trim().max(40).optional().transform((v) => v || null),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
  openingBalance: z.number().int(),
  openingDate: z.date(),
});
export type AccountInput = z.input<typeof accountInputSchema>;

// -----------------------------------------------------------------------------
// Lectura
// -----------------------------------------------------------------------------

export interface AccountSummary {
  account: Account;
  method: BalanceMethod;
  /** Saldo actual (céntimos). */
  balance: number;
  /** Fecha del dato de saldo; null si solo hay saldo inicial sin movimientos. */
  balanceDate: Date;
  lastDeclared: { date: Date; balance: number } | null;
  /** declarado − calculado a la fecha del último saldo declarado (solo TRANSACTIONS). */
  lastDifference: number | null;
  transactionCount: number;
}

/**
 * Saldo de una cuenta por método TRANSACTIONS usando agregados SQL.
 * Misma regla que `computeBalance` del dominio (movimientos con fecha > openingDate);
 * hay un test que verifica que ambos coinciden.
 */
async function aggregateBalance(db: Db, account: Account, at?: Date) {
  const agg = await db.transaction.aggregate({
    where: { accountId: account.id, date: { gt: account.openingDate, ...(at ? { lte: at } : {}) } },
    _sum: { amount: true },
    _max: { date: true },
  });
  return {
    balance: account.openingBalance + (agg._sum.amount ?? 0),
    lastDate: agg._max.date ?? account.openingDate,
  };
}

export async function listAccounts(
  db: Db,
  userId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<AccountSummary[]> {
  const accounts = await db.account.findMany({
    where: { userId, ...(opts.includeArchived ? {} : { archived: false }) },
    orderBy: [{ archived: "asc" }, { type: "asc" }, { name: "asc" }],
    include: {
      balances: { orderBy: { date: "desc" }, take: 1 },
      _count: { select: { transactions: true } },
    },
  });

  return Promise.all(
    accounts.map(async ({ balances, _count, ...account }) => {
      const method = balanceMethod(account.type);
      const last = balances[0] ? { date: balances[0].date, balance: balances[0].balance } : null;
      if (method === "DECLARED") {
        const d = last && last.date >= account.openingDate ? last : null;
        return {
          account,
          method,
          balance: d?.balance ?? account.openingBalance,
          balanceDate: d?.date ?? account.openingDate,
          lastDeclared: last,
          lastDifference: null,
          transactionCount: _count.transactions,
        };
      }
      const current = await aggregateBalance(db, account);
      let lastDifference: number | null = null;
      if (last && last.date >= account.openingDate) {
        const atDeclared = await aggregateBalance(db, account, last.date);
        lastDifference = last.balance - atDeclared.balance;
      }
      return {
        account,
        method,
        balance: current.balance,
        balanceDate: current.lastDate,
        lastDeclared: last,
        lastDifference,
        transactionCount: _count.transactions,
      };
    }),
  );
}

export interface AccountDetail {
  account: Account;
  method: BalanceMethod;
  balance: number;
  balanceDate: Date | null;
  balances: AccountBalance[];
  reconciliation: ReconciliationRow[];
  transactionCount: number;
  /** Movimientos con fecha <= saldo inicial (no suman: ya incluidos en él). */
  ignoredBeforeOpening: number;
}

export async function getAccountDetail(db: Db, userId: string, accountId: string): Promise<AccountDetail> {
  const account = await db.account.findFirst({
    where: { id: accountId, userId },
    include: { balances: { orderBy: { date: "desc" } } },
  });
  if (!account) throw new UserError("La cuenta no existe.");
  const { balances, ...acc } = account;
  const method = balanceMethod(acc.type);
  const opening = { balance: acc.openingBalance, date: acc.openingDate };

  if (method === "DECLARED") {
    const d = latestDeclared(balances.filter((b) => b.date >= acc.openingDate));
    return {
      account: acc,
      method,
      balance: d?.balance ?? acc.openingBalance,
      balanceDate: d?.date ?? acc.openingDate,
      balances,
      reconciliation: [],
      transactionCount: await db.transaction.count({ where: { accountId } }),
      ignoredBeforeOpening: 0,
    };
  }

  const txs = await db.transaction.findMany({
    where: { accountId },
    select: { id: true, date: true, amount: true },
    orderBy: { date: "asc" },
  });
  const computed = computeBalance(opening, txs);
  return {
    account: acc,
    method,
    balance: computed.balance,
    balanceDate: computed.asOf,
    balances,
    reconciliation: reconcile(opening, txs, balances).reverse(),
    transactionCount: txs.length,
    ignoredBeforeOpening: computed.ignoredBeforeOpening.length,
  };
}

// -----------------------------------------------------------------------------
// Escritura
// -----------------------------------------------------------------------------

function parseAccount(input: AccountInput) {
  const r = accountInputSchema.safeParse(input);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of r.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    throw new UserError("Revisa los campos marcados.", fieldErrors);
  }
  return r.data;
}

export async function createAccount(db: Db, userId: string, input: AccountInput): Promise<Account> {
  const data = parseAccount(input);
  try {
    return await inTransaction(db, async (tx) => {
      const account = await tx.account.create({ data: { ...data, userId } });
      await writeAudit(tx, { userId, entity: "Account", entityId: account.id, action: "create", after: account });
      return account;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError("Ya tienes una cuenta con ese nombre.", { name: "Nombre repetido" });
    throw e;
  }
}

export async function updateAccount(
  db: Db,
  userId: string,
  accountId: string,
  input: AccountInput,
): Promise<Account> {
  const data = parseAccount(input);
  try {
    return await inTransaction(db, async (tx) => {
      const before = await tx.account.findFirst({ where: { id: accountId, userId } });
      if (!before) throw new UserError("La cuenta no existe.");
      const after = await tx.account.update({ where: { id: accountId }, data });
      await writeAudit(tx, { userId, entity: "Account", entityId: accountId, action: "update", before, after });
      return after;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError("Ya tienes una cuenta con ese nombre.", { name: "Nombre repetido" });
    throw e;
  }
}

export async function setAccountArchived(db: Db, userId: string, accountId: string, archived: boolean) {
  const r = await db.account.updateMany({ where: { id: accountId, userId }, data: { archived } });
  if (r.count === 0) throw new UserError("La cuenta no existe.");
}

/** Solo se pueden borrar cuentas vacías; las demás se archivan (trazabilidad). */
export async function deleteAccount(db: Db, userId: string, accountId: string) {
  await inTransaction(db, async (tx) => {
    const acc = await tx.account.findFirst({
      where: { id: accountId, userId },
      include: { _count: { select: { transactions: true, imports: true } } },
    });
    if (!acc) throw new UserError("La cuenta no existe.");
    if (acc._count.transactions > 0 || acc._count.imports > 0) {
      throw new UserError("La cuenta tiene movimientos o importaciones: archívala en lugar de borrarla.");
    }
    const { _count, ...before } = acc;
    await tx.account.delete({ where: { id: accountId } });
    await writeAudit(tx, { userId, entity: "Account", entityId: accountId, action: "delete", before });
  });
}

export const declaredBalanceSchema = z.object({
  date: z.date(),
  balance: z.number().int(),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
});

/** Registra un saldo declarado (lo que dice el banco). Nunca sobrescribe otro. */
export async function addDeclaredBalance(
  db: Db,
  userId: string,
  accountId: string,
  input: z.input<typeof declaredBalanceSchema>,
): Promise<AccountBalance> {
  const data = declaredBalanceSchema.parse(input);
  const acc = await db.account.findFirst({ where: { id: accountId, userId } });
  if (!acc) throw new UserError("La cuenta no existe.");
  try {
    return await inTransaction(db, async (tx) => {
      const b = await tx.accountBalance.create({ data: { ...data, accountId, source: "MANUAL" } });
      await writeAudit(tx, { userId, entity: "AccountBalance", entityId: b.id, action: "create", after: b });
      return b;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new UserError("Ya hay un saldo manual en esa fecha. Bórralo primero si quieres corregirlo.");
    }
    throw e;
  }
}

export async function deleteDeclaredBalance(db: Db, userId: string, balanceId: string) {
  await inTransaction(db, async (tx) => {
    const b = await tx.accountBalance.findFirst({ where: { id: balanceId, account: { userId } } });
    if (!b) throw new UserError("El saldo no existe.");
    await tx.accountBalance.delete({ where: { id: balanceId } });
    await writeAudit(tx, { userId, entity: "AccountBalance", entityId: balanceId, action: "delete", before: b });
  });
}
