import { z } from "zod";
import type { Liability, LiabilityType } from "@/generated/prisma/client";
import { inTransaction, isUniqueViolation, UserError, writeAudit, type Db } from "./common";

export const LIABILITY_TYPE_LABELS: Record<LiabilityType, string> = {
  MORTGAGE: "Hipoteca",
  LOAN: "Préstamo",
  FINANCING: "Financiación",
  CREDIT_CARD: "Tarjeta de crédito",
  OTHER: "Otra deuda",
};
const LIABILITY_TYPES = Object.keys(LIABILITY_TYPE_LABELS) as [LiabilityType, ...LiabilityType[]];

const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().nullable().transform((v) => v ?? null);

export const liabilityInputSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  type: z.enum(LIABILITY_TYPES),
  lender: z.string().trim().max(80).optional().transform((v) => v || null),
  originalAmount: opt(z.number().int().positive()),
  interestRate: opt(z.number().min(0).max(100)),
  startDate: opt(z.date()),
  endDate: opt(z.date()),
  monthlyPayment: opt(z.number().int().positive()),
  paymentAccountId: z.string().optional().transform((v) => v || null),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
});
export type LiabilityInput = z.input<typeof liabilityInputSchema>;

export const liabilityBalanceSchema = z.object({
  date: z.date(),
  balance: z.number().int().min(0, "La deuda pendiente no puede ser negativa"),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
});

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of r.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    throw new UserError("Revisa los campos marcados.", fieldErrors);
  }
  return r.data;
}

export async function listLiabilities(db: Db, userId: string, opts: { includeArchived?: boolean } = {}) {
  const rows = await db.liability.findMany({
    where: { userId, ...(opts.includeArchived ? {} : { archived: false }) },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    include: {
      balances: { orderBy: { date: "desc" }, take: 1 },
      paymentAccount: { select: { id: true, name: true } },
    },
  });
  return rows.map(({ balances, ...l }) => ({
    liability: l,
    /** null = "Pendiente de datos": no hay ningún saldo registrado. */
    current: balances[0] ?? null,
  }));
}

export async function getLiability(db: Db, userId: string, id: string) {
  const l = await db.liability.findFirst({
    where: { id, userId },
    include: { balances: { orderBy: { date: "desc" } } },
  });
  if (!l) throw new UserError("La deuda no existe.");
  return l;
}

async function checkPaymentAccount(db: Db, userId: string, accountId: string | null) {
  if (accountId && !(await db.account.findFirst({ where: { id: accountId, userId } }))) {
    throw new UserError("La cuenta de pago no existe.");
  }
}

export async function createLiability(
  db: Db,
  userId: string,
  input: LiabilityInput,
  initialBalance?: z.input<typeof liabilityBalanceSchema>,
): Promise<Liability> {
  const data = parse(liabilityInputSchema, input);
  const initial = initialBalance ? parse(liabilityBalanceSchema, initialBalance) : null;
  await checkPaymentAccount(db, userId, data.paymentAccountId);
  try {
    return await inTransaction(db, async (tx) => {
      const l = await tx.liability.create({
        data: { ...data, interestRate: data.interestRate?.toString() ?? null, userId },
      });
      if (initial) await tx.liabilityBalance.create({ data: { ...initial, liabilityId: l.id } });
      await writeAudit(tx, { userId, entity: "Liability", entityId: l.id, action: "create", after: l });
      return l;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError("Ya tienes una deuda con ese nombre.", { name: "Nombre repetido" });
    throw e;
  }
}

export async function updateLiability(db: Db, userId: string, id: string, input: LiabilityInput) {
  const data = parse(liabilityInputSchema, input);
  await checkPaymentAccount(db, userId, data.paymentAccountId);
  try {
    return await inTransaction(db, async (tx) => {
      const before = await tx.liability.findFirst({ where: { id, userId } });
      if (!before) throw new UserError("La deuda no existe.");
      const after = await tx.liability.update({
        where: { id },
        data: { ...data, interestRate: data.interestRate?.toString() ?? null },
      });
      await writeAudit(tx, { userId, entity: "Liability", entityId: id, action: "update", before, after });
      return after;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError("Ya tienes una deuda con ese nombre.", { name: "Nombre repetido" });
    throw e;
  }
}

export async function setLiabilityArchived(db: Db, userId: string, id: string, archived: boolean) {
  const r = await db.liability.updateMany({ where: { id, userId }, data: { archived } });
  if (r.count === 0) throw new UserError("La deuda no existe.");
}

export async function addLiabilityBalance(
  db: Db,
  userId: string,
  id: string,
  input: z.input<typeof liabilityBalanceSchema>,
) {
  const data = parse(liabilityBalanceSchema, input);
  if (!(await db.liability.findFirst({ where: { id, userId } }))) throw new UserError("La deuda no existe.");
  try {
    return await inTransaction(db, async (tx) => {
      const b = await tx.liabilityBalance.create({ data: { ...data, liabilityId: id } });
      await writeAudit(tx, { userId, entity: "LiabilityBalance", entityId: b.id, action: "create", after: b });
      return b;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError("Ya hay un saldo registrado en esa fecha. Bórralo primero para corregirlo.");
    throw e;
  }
}

export async function deleteLiabilityBalance(db: Db, userId: string, balanceId: string) {
  await inTransaction(db, async (tx) => {
    const b = await tx.liabilityBalance.findFirst({ where: { id: balanceId, liability: { userId } } });
    if (!b) throw new UserError("El saldo no existe.");
    await tx.liabilityBalance.delete({ where: { id: balanceId } });
    await writeAudit(tx, { userId, entity: "LiabilityBalance", entityId: balanceId, action: "delete", before: b });
  });
}
