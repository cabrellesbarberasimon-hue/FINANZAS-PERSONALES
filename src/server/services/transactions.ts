import { z } from "zod";
import { summarizeCashflow, type CashflowSummary, type TxKind } from "@/domain/cashflow";
import { monthRange } from "@/domain/dates";
import { computeDedupHash, occurrenceKey } from "@/domain/dedup";
import { cleanDescription, merchantKey } from "@/domain/text";
import { canLinkTransfer, findTransferCandidates, TRANSFER_MAX_DAYS } from "@/domain/transfers";
import { checkKindAmount, defaultKindForAmount, TX_KINDS } from "@/domain/transactions";
import type { Prisma, Transaction } from "@/generated/prisma/client";
import { findMatchingRule } from "@/domain/rules";
import { inTransaction, isUniqueViolation, UserError, writeAudit, type Db } from "./common";
import { loadSortedRules } from "./rules";

// -----------------------------------------------------------------------------
// Filtros y listado
// -----------------------------------------------------------------------------

export interface TransactionFilters {
  from?: Date;
  to?: Date;
  /** "YYYY-MM" */
  month?: string;
  year?: number;
  accountId?: string;
  /** id de categoría, o "none" para movimientos sin categoría */
  categoryId?: string;
  subcategoryId?: string;
  kind?: TxKind;
  /** Importe mínimo/máximo en valor ABSOLUTO (céntimos). */
  minAmount?: number;
  maxAmount?: number;
  q?: string;
  importId?: string;
  reviewed?: boolean;
}

export function buildTransactionWhere(userId: string, f: TransactionFilters): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [{ userId }];

  const dateFilter: Prisma.DateTimeFilter = {};
  if (f.month) {
    const r = monthRange(f.month);
    dateFilter.gte = r.start;
    dateFilter.lt = r.end;
  } else if (f.year) {
    dateFilter.gte = new Date(Date.UTC(f.year, 0, 1));
    dateFilter.lt = new Date(Date.UTC(f.year + 1, 0, 1));
  }
  if (Object.keys(dateFilter).length) and.push({ date: dateFilter });
  if (f.from) and.push({ date: { gte: f.from } });
  if (f.to) and.push({ date: { lte: f.to } });

  if (f.accountId) and.push({ accountId: f.accountId });
  if (f.categoryId === "none") and.push({ categoryId: null });
  else if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.subcategoryId) and.push({ subcategoryId: f.subcategoryId });
  if (f.kind) and.push({ kind: f.kind });
  if (f.importId) and.push({ importId: f.importId });
  if (f.reviewed !== undefined) and.push({ reviewed: f.reviewed });

  if (f.minAmount !== undefined || f.maxAmount !== undefined) {
    const min = f.minAmount ?? 0;
    const max = f.maxAmount;
    and.push({
      OR: [
        { amount: { gte: min, ...(max !== undefined ? { lte: max } : {}) } },
        { amount: { lte: -min, ...(max !== undefined ? { gte: -max } : {}) } },
      ],
    });
  }

  const q = f.q?.trim();
  if (q) {
    and.push({
      OR: [
        { descriptionRaw: { contains: q } },
        { descriptionClean: { contains: q.toUpperCase() } },
        { merchant: { contains: q } },
        { notes: { contains: q } },
      ],
    });
  }
  return { AND: and };
}

export const TRANSACTIONS_PAGE_SIZE = 50;

export async function listTransactions(
  db: Db,
  userId: string,
  filters: TransactionFilters,
  page = 1,
) {
  const where = buildTransactionWhere(userId, filters);
  const [rows, total, forSummary] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (Math.max(page, 1) - 1) * TRANSACTIONS_PAGE_SIZE,
      take: TRANSACTIONS_PAGE_SIZE,
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
        subcategory: { select: { id: true, name: true } },
      },
    }),
    db.transaction.count({ where }),
    // Totales del conjunto filtrado COMPLETO (no solo de la página).
    db.transaction.findMany({ where, select: { id: true, amount: true, kind: true } }),
  ]);
  const summary: CashflowSummary = summarizeCashflow(forSummary);
  const net = forSummary.reduce((s, t) => s + t.amount, 0);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / TRANSACTIONS_PAGE_SIZE)),
    summary,
    net,
  };
}

export async function getTransaction(db: Db, userId: string, id: string) {
  const tx = await db.transaction.findFirst({
    where: { id, userId },
    include: {
      account: true,
      category: true,
      subcategory: true,
      rule: true,
      import: { select: { id: true, fileName: true, createdAt: true } },
      transferPeer: { include: { account: { select: { id: true, name: true } } } },
      reviewFlags: { where: { status: "OPEN" } },
    },
  });
  if (!tx) throw new UserError("El movimiento no existe.");
  const audit = await db.auditLog.findMany({
    where: { userId, entity: "Transaction", entityId: id },
    orderBy: { createdAt: "desc" },
  });
  return { tx, audit };
}

// -----------------------------------------------------------------------------
// Alta y edición
// -----------------------------------------------------------------------------

const optionalId = z
  .string()
  .optional()
  .transform((v) => v || null);

export const manualTransactionSchema = z.object({
  accountId: z.string().min(1, "Elige una cuenta"),
  date: z.date({ error: "Fecha no válida" }),
  amount: z.number({ error: "Importe no válido" }).int(),
  description: z.string().trim().min(1, "La descripción es obligatoria").max(300),
  categoryId: optionalId,
  subcategoryId: optionalId,
  /** Solo se usa si no hay categoría. */
  kind: z.enum(TX_KINDS as [TxKind, ...TxKind[]]).optional(),
  merchant: z.string().trim().max(120).optional().transform((v) => v || null),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
  isExtraordinary: z.boolean().default(false),
});
export type ManualTransactionInput = z.input<typeof manualTransactionSchema>;

export const transactionEditSchema = z.object({
  descriptionClean: z.string().trim().min(1, "La descripción es obligatoria").max(300),
  merchant: z.string().trim().max(120).optional().transform((v) => v || null),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
  categoryId: optionalId,
  subcategoryId: optionalId,
  kind: z.enum(TX_KINDS as [TxKind, ...TxKind[]]).optional(),
  isExtraordinary: z.boolean().default(false),
  reviewed: z.boolean().default(false),
  /** Solo movimientos MANUALES: los importados reflejan el extracto y no se alteran. */
  date: z.date().optional(),
  amount: z.number().int().optional(),
  descriptionRaw: z.string().trim().min(1).max(300).optional(),
});
export type TransactionEditInput = z.input<typeof transactionEditSchema>;

function zodToUserError(error: z.ZodError): UserError {
  const fieldErrors: Record<string, string> = {};
  for (const i of error.issues) fieldErrors[String(i.path[0])] ??= i.message;
  return new UserError("Revisa los campos marcados.", fieldErrors);
}

/** Resuelve categoría/subcategoría y el tipo resultante, validando pertenencia. */
async function resolveCategory(
  db: Db,
  userId: string,
  categoryId: string | null,
  subcategoryId: string | null,
  fallbackKind: TxKind,
): Promise<{ categoryId: string | null; subcategoryId: string | null; kind: TxKind }> {
  if (!categoryId) {
    if (subcategoryId) throw new UserError("Subcategoría sin categoría.");
    return { categoryId: null, subcategoryId: null, kind: fallbackKind };
  }
  const cat = await db.category.findFirst({ where: { id: categoryId, userId } });
  if (!cat) throw new UserError("La categoría no existe.");
  if (subcategoryId) {
    const sub = await db.subcategory.findFirst({ where: { id: subcategoryId, categoryId } });
    if (!sub) throw new UserError("La subcategoría no pertenece a la categoría elegida.");
  }
  return { categoryId, subcategoryId, kind: cat.kind };
}

/** Siguiente ocurrencia libre para una operación idéntica en la cuenta. */
async function nextOccurrenceHash(
  db: Db,
  accountId: string,
  fields: { date: Date; amount: number; description: string },
  excludeId?: string,
): Promise<{ occurrence: number; dedupHash: string; duplicates: Transaction[] }> {
  const key = occurrenceKey(fields);
  const sameDay = await db.transaction.findMany({
    where: { accountId, date: fields.date, amount: fields.amount, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  const duplicates = sameDay.filter((t) => occurrenceKey({ ...t, description: t.descriptionRaw }) === key);
  const taken = new Set(sameDay.map((t) => t.dedupHash));
  let occurrence = 0;
  let dedupHash = computeDedupHash({ accountId, ...fields }, occurrence);
  while (taken.has(dedupHash)) {
    occurrence++;
    dedupHash = computeDedupHash({ accountId, ...fields }, occurrence);
  }
  return { occurrence, dedupHash, duplicates };
}

export async function createManualTransaction(
  db: Db,
  userId: string,
  input: ManualTransactionInput,
  opts: { allowDuplicate?: boolean } = {},
): Promise<Transaction> {
  const parsed = manualTransactionSchema.safeParse(input);
  if (!parsed.success) throw zodToUserError(parsed.error);
  const data = parsed.data;

  const account = await db.account.findFirst({ where: { id: data.accountId, userId } });
  if (!account) throw new UserError("La cuenta no existe.", { accountId: "Cuenta no válida" });

  const cat = await resolveCategory(
    db, userId, data.categoryId, data.subcategoryId, data.kind ?? defaultKindForAmount(data.amount),
  );
  const check = checkKindAmount(cat.kind, data.amount);
  if (!check.ok) throw new UserError(check.reason, { amount: check.reason });

  // Sin categoría elegida (y sin tipo forzado): se prueban las reglas automáticas.
  let rule: { id: string; categoryId: string; subcategoryId: string | null; kind: TxKind } | null = null;
  if (!cat.categoryId && !data.kind) {
    const match = findMatchingRule(await loadSortedRules(db, userId), {
      accountId: account.id, amount: data.amount, description: data.description, merchant: data.merchant,
    });
    if (match && checkKindAmount(match.setKind ?? match.categoryKind, data.amount).ok) {
      rule = { id: match.id, categoryId: match.categoryId, subcategoryId: match.subcategoryId, kind: match.setKind ?? match.categoryKind };
    }
  }

  return inTransaction(db, async (tx) => {
    const fields = { date: data.date, amount: data.amount, description: data.description };
    const { occurrence, dedupHash, duplicates } = await nextOccurrenceHash(tx, account.id, fields);
    // Nunca introducir duplicados en silencio (§7): se exige confirmación explícita.
    if (duplicates.length > 0 && !opts.allowDuplicate) {
      throw new UserError(
        "Ya existe un movimiento idéntico (misma cuenta, fecha, importe y descripción). Marca «Es otra operación distinta» para guardarlo igualmente.",
        { allowDuplicate: "Posible duplicado" },
      );
    }
    const created = await tx.transaction.create({
      data: {
        userId,
        accountId: account.id,
        date: data.date,
        amount: data.amount,
        currency: account.currency,
        descriptionRaw: data.description,
        descriptionClean: cleanDescription(data.description),
        merchant: data.merchant ?? (merchantKey(data.description) || null),
        notes: data.notes,
        kind: rule?.kind ?? cat.kind,
        categoryId: rule?.categoryId ?? cat.categoryId,
        subcategoryId: rule ? rule.subcategoryId : cat.subcategoryId,
        categorizationSource: cat.categoryId ? "MANUAL" : rule ? "RULE" : "NONE",
        ruleId: rule?.id ?? null,
        isExtraordinary: data.isExtraordinary,
        dedupHash,
        occurrence,
        source: "MANUAL",
        reviewed: true,
      },
    });
    await writeAudit(tx, { userId, entity: "Transaction", entityId: created.id, action: "create", after: created });
    return created;
  });
}

export async function updateTransaction(
  db: Db,
  userId: string,
  id: string,
  input: TransactionEditInput,
): Promise<Transaction> {
  const parsed = transactionEditSchema.safeParse(input);
  if (!parsed.success) throw zodToUserError(parsed.error);
  const data = parsed.data;

  return inTransaction(db, async (tx) => {
    const before = await tx.transaction.findFirst({ where: { id, userId } });
    if (!before) throw new UserError("El movimiento no existe.");

    const isManual = before.source === "MANUAL";
    const touchesBankData =
      (data.date && data.date.getTime() !== before.date.getTime()) ||
      (data.amount !== undefined && data.amount !== before.amount) ||
      (data.descriptionRaw !== undefined && data.descriptionRaw !== before.descriptionRaw);
    if (touchesBankData && !isManual) {
      throw new UserError(
        "La fecha, el importe y la descripción original de un movimiento importado reflejan el extracto del banco y no se pueden cambiar.",
      );
    }
    const date = data.date ?? before.date;
    const amount = data.amount ?? before.amount;
    const descriptionRaw = data.descriptionRaw ?? before.descriptionRaw;

    // Transferencia vinculada: el tipo y la categoría los fija el vínculo.
    if (before.transferPeerId) {
      if (touchesBankData) throw new UserError("Desvincula la transferencia antes de cambiar fecha o importe.");
      if (data.categoryId !== before.categoryId || (data.kind && data.kind !== "TRANSFER")) {
        throw new UserError("Es una transferencia interna vinculada: desvincúlala antes de recategorizarla.");
      }
    }

    const cat = await resolveCategory(
      tx, userId, data.categoryId, data.subcategoryId, data.kind ?? before.kind,
    );
    const check = checkKindAmount(cat.kind, amount);
    if (!check.ok) throw new UserError(check.reason);

    let hashUpdate: { dedupHash?: string; occurrence?: number } = {};
    if (touchesBankData) {
      const h = await nextOccurrenceHash(tx, before.accountId, { date, amount, description: descriptionRaw }, id);
      hashUpdate = { dedupHash: h.dedupHash, occurrence: h.occurrence };
    }

    const categoryChanged =
      cat.categoryId !== before.categoryId || cat.subcategoryId !== before.subcategoryId;

    const after = await tx.transaction.update({
      where: { id },
      data: {
        descriptionClean: data.descriptionClean,
        merchant: data.merchant,
        notes: data.notes,
        isExtraordinary: data.isExtraordinary,
        reviewed: data.reviewed,
        kind: cat.kind,
        categoryId: cat.categoryId,
        subcategoryId: cat.subcategoryId,
        ...(categoryChanged
          ? { categorizationSource: cat.categoryId ? "MANUAL" : "NONE", ruleId: null }
          : {}),
        ...(touchesBankData ? { date, amount, descriptionRaw, ...hashUpdate } : {}),
      },
    });

    // Aprendizaje (fase 4): cada corrección manual de categoría queda registrada.
    if (categoryChanged && cat.categoryId) {
      const key = merchantKey(before.descriptionRaw);
      if (key) {
        await tx.categorizationCorrection.create({
          data: {
            userId,
            transactionId: id,
            merchantKey: key,
            categoryId: cat.categoryId,
            subcategoryId: cat.subcategoryId,
          },
        });
      }
    }

    await writeAudit(tx, { userId, entity: "Transaction", entityId: id, action: "update", before, after });
    return after;
  }).catch((e) => {
    if (isUniqueViolation(e)) throw new UserError("El cambio crearía un duplicado exacto de otro movimiento.");
    throw e;
  });
}

export async function deleteTransaction(db: Db, userId: string, id: string): Promise<void> {
  await inTransaction(db, async (tx) => {
    const before = await tx.transaction.findFirst({ where: { id, userId } });
    if (!before) throw new UserError("El movimiento no existe.");
    if (before.transferPeerId) await unlinkTransferInTx(tx, userId, id);
    await tx.transaction.delete({ where: { id } });
    await writeAudit(tx, { userId, entity: "Transaction", entityId: id, action: "delete", before });
  });
}

// -----------------------------------------------------------------------------
// Transferencias internas
// -----------------------------------------------------------------------------

async function transferCategory(db: Db, userId: string) {
  const cat = await db.category.findFirst({
    where: { userId, kind: "TRANSFER" },
    orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }],
    include: { subcategories: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  return { categoryId: cat?.id ?? null, subcategoryId: cat?.subcategories[0]?.id ?? null };
}

export async function getTransferCandidates(db: Db, userId: string, id: string) {
  const tx = await db.transaction.findFirst({ where: { id, userId } });
  if (!tx || tx.transferPeerId) return [];
  const window = TRANSFER_MAX_DAYS * 86_400_000;
  const pool = await db.transaction.findMany({
    where: {
      userId,
      accountId: { not: tx.accountId },
      amount: -tx.amount,
      transferPeerId: null,
      date: { gte: new Date(tx.date.getTime() - window), lte: new Date(tx.date.getTime() + window) },
    },
    include: { account: { select: { id: true, name: true } } },
  });
  return findTransferCandidates(tx, pool);
}

export async function linkTransfer(db: Db, userId: string, aId: string, bId: string): Promise<void> {
  await inTransaction(db, async (tx) => {
    const [a, b] = await Promise.all([
      tx.transaction.findFirst({ where: { id: aId, userId } }),
      tx.transaction.findFirst({ where: { id: bId, userId } }),
    ]);
    if (!a || !b) throw new UserError("Movimiento no encontrado.");
    const check = canLinkTransfer(a, b);
    if (!check.ok) throw new UserError(check.reason);
    const cat = await transferCategory(tx, userId);
    const common = { kind: "TRANSFER" as const, ...cat, categorizationSource: "MANUAL" as const, ruleId: null };
    const a2 = await tx.transaction.update({ where: { id: a.id }, data: { ...common, transferPeerId: b.id } });
    const b2 = await tx.transaction.update({ where: { id: b.id }, data: { ...common, transferPeerId: a.id } });
    await writeAudit(tx, { userId, entity: "Transaction", entityId: a.id, action: "link", before: a, after: a2 });
    await writeAudit(tx, { userId, entity: "Transaction", entityId: b.id, action: "link", before: b, after: b2 });
    // Los avisos "¿transferencia interna?" de ambos quedan resueltos.
    await tx.reviewFlag.updateMany({
      where: {
        userId,
        status: "OPEN",
        type: "POSSIBLE_TRANSFER",
        OR: [{ transactionId: { in: [a.id, b.id] } }, { relatedTransactionId: { in: [a.id, b.id] } }],
      },
      data: { status: "RESOLVED", resolution: "Vinculada como transferencia interna", resolvedAt: new Date() },
    });
  });
}

async function unlinkTransferInTx(tx: Db, userId: string, id: string) {
  const a = await tx.transaction.findFirst({ where: { id, userId } });
  if (!a?.transferPeerId) throw new UserError("El movimiento no está vinculado a ninguna transferencia.");
  const b = await tx.transaction.findFirst({ where: { id: a.transferPeerId, userId } });
  const reset = (amount: number) => ({
    transferPeerId: null,
    kind: defaultKindForAmount(amount),
    categoryId: null,
    subcategoryId: null,
    categorizationSource: "NONE" as const,
    ruleId: null,
    reviewed: false,
  });
  const a2 = await tx.transaction.update({ where: { id: a.id }, data: reset(a.amount) });
  await writeAudit(tx, { userId, entity: "Transaction", entityId: a.id, action: "unlink", before: a, after: a2 });
  if (b) {
    const b2 = await tx.transaction.update({ where: { id: b.id }, data: reset(b.amount) });
    await writeAudit(tx, { userId, entity: "Transaction", entityId: b.id, action: "unlink", before: b, after: b2 });
  }
}

export async function unlinkTransfer(db: Db, userId: string, id: string): Promise<void> {
  await inTransaction(db, (tx) => unlinkTransferInTx(tx, userId, id));
}
