import { z } from "zod";
import { formatDateES } from "@/domain/dates";
import {
  completeTrade,
  computePosition,
  InvestmentDataError,
  investmentCashFlows,
  isValidIsin,
  monthlySeries,
  xirr,
  type CashFlow,
  type InvPrice,
  type InvTx,
  type MonthPoint,
  type Position,
} from "@/domain/investments";
import { formatMoney, percentage } from "@/domain/money";
import type { DistributionGroup } from "@/domain/networth";
import { defaultKindForAmount } from "@/domain/transactions";
import type { AssetType, Investment, InvestmentPrice, InvestmentTransaction } from "@/generated/prisma/client";
import { inTransaction, isUniqueViolation, UserError, writeAudit, type Db } from "./common";

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  INDEX_FUND: "Fondo indexado",
  ETF: "ETF",
  ACTIVE_FUND: "Fondo activo",
  STOCK: "Acciones",
  PIAS: "PIAS",
  PENSION_PLAN: "Plan de pensiones",
  CRYPTO: "Criptomonedas",
  OTHER: "Otros",
};

export const INV_TX_LABELS = { BUY: "Aportación / compra", SELL: "Reembolso / venta", DIVIDEND: "Dividendo", FEE: "Comisión" } as const;

/** Grupo de la distribución del patrimonio para cada tipo de activo. */
export function distributionGroupFor(type: AssetType): DistributionGroup {
  switch (type) {
    case "INDEX_FUND":
      return "INDEX_FUNDS";
    case "ACTIVE_FUND":
      return "OTHER_FUNDS";
    case "ETF":
    case "STOCK":
      return "STOCKS";
    case "PIAS":
    case "PENSION_PLAN":
      return "PLANS";
    default:
      return "INVESTMENT_OTHER";
  }
}

// -----------------------------------------------------------------------------
// Conversión Prisma -> dominio
// -----------------------------------------------------------------------------

export function toInvTx(t: InvestmentTransaction): InvTx {
  return {
    id: t.id,
    date: t.date,
    type: t.type,
    units: t.units?.toString() ?? null,
    price: t.price?.toString() ?? null,
    amount: t.amount,
    fees: t.fees,
  };
}

export function toInvPrice(p: InvestmentPrice): InvPrice {
  return { date: p.date, price: p.price?.toString() ?? null, totalValue: p.totalValue };
}

function safePosition(inv: Investment, txs: InvestmentTransaction[], prices: InvestmentPrice[], asOf: Date): { position: Position | null; error?: string } {
  try {
    return { position: computePosition(txs.map(toInvTx), prices.map(toInvPrice), inv.valuationMode, asOf) };
  } catch (e) {
    if (e instanceof InvestmentDataError) return { position: null, error: e.message };
    throw e;
  }
}

// -----------------------------------------------------------------------------
// Inversiones (CRUD)
// -----------------------------------------------------------------------------

const ASSET_TYPES = Object.keys(ASSET_TYPE_LABELS) as [AssetType, ...AssetType[]];

export const investmentInputSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  assetType: z.enum(ASSET_TYPES),
  isin: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || isValidIsin(v), "ISIN no válido (revisa el dígito de control)"),
  ticker: z.string().trim().max(20).optional().transform((v) => v || null),
  platform: z.string().trim().max(80).optional().transform((v) => v || null),
  accountId: z.string().optional().transform((v) => v || null),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Moneda ISO de 3 letras").default("EUR"),
  valuationMode: z.enum(["UNITS", "TOTAL_VALUE"]).default("UNITS"),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
});
export type InvestmentInput = z.input<typeof investmentInputSchema>;

/** "1.107,21" -> "1107.21"; "105.34" -> "105.34" (participaciones y precios). */
export function normalizeDecimalInput(v: string | undefined | null): string | null {
  if (!v) return null;
  const t = v.trim().replace(/\s/g, "");
  if (t === "") return null;
  return t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
}

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of r.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    throw new UserError(Object.values(fieldErrors)[0] ?? "Datos no válidos.", fieldErrors);
  }
  return r.data;
}

async function checkAccount(db: Db, userId: string, accountId: string | null) {
  if (accountId && !(await db.account.findFirst({ where: { id: accountId, userId } }))) throw new UserError("La cuenta no existe.");
}

export async function createInvestment(db: Db, userId: string, input: InvestmentInput): Promise<Investment> {
  const data = parse(investmentInputSchema, input);
  await checkAccount(db, userId, data.accountId);
  try {
    return await inTransaction(db, async (tx) => {
      const inv = await tx.investment.create({ data: { ...data, userId } });
      await writeAudit(tx, { userId, entity: "Investment", entityId: inv.id, action: "create", after: inv });
      return inv;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError("Ya tienes una inversión con ese nombre.", { name: "Repetido" });
    throw e;
  }
}

export async function updateInvestment(db: Db, userId: string, id: string, input: InvestmentInput) {
  const data = parse(investmentInputSchema, input);
  await checkAccount(db, userId, data.accountId);
  try {
    return await inTransaction(db, async (tx) => {
      const before = await tx.investment.findFirst({ where: { id, userId }, include: { _count: { select: { transactions: true } } } });
      if (!before) throw new UserError("La inversión no existe.");
      if (before.valuationMode !== data.valuationMode && before._count.transactions > 0) {
        throw new UserError("No se puede cambiar el modo de valoración de una inversión con operaciones.");
      }
      const { _count, ...b } = before;
      const after = await tx.investment.update({ where: { id }, data });
      await writeAudit(tx, { userId, entity: "Investment", entityId: id, action: "update", before: b, after });
      return after;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError("Ya tienes una inversión con ese nombre.", { name: "Repetido" });
    throw e;
  }
}

export async function setInvestmentArchived(db: Db, userId: string, id: string, archived: boolean) {
  const r = await db.investment.updateMany({ where: { id, userId }, data: { archived } });
  if (r.count === 0) throw new UserError("La inversión no existe.");
}

/** Solo se borran inversiones sin operaciones ni precios; si no, se archivan. */
export async function deleteInvestment(db: Db, userId: string, id: string) {
  await inTransaction(db, async (tx) => {
    const inv = await tx.investment.findFirst({ where: { id, userId }, include: { _count: { select: { transactions: true, prices: true } } } });
    if (!inv) throw new UserError("La inversión no existe.");
    if (inv._count.transactions + inv._count.prices > 0) throw new UserError("Tiene operaciones o valoraciones: archívala en lugar de borrarla.");
    await tx.investment.delete({ where: { id } });
    const { _count, ...before } = inv;
    await writeAudit(tx, { userId, entity: "Investment", entityId: id, action: "delete", before });
  });
}

// -----------------------------------------------------------------------------
// Operaciones
// -----------------------------------------------------------------------------

export const investmentTxSchema = z.object({
  type: z.enum(["BUY", "SELL", "DIVIDEND", "FEE"]),
  date: z.date({ error: "Fecha no válida" }),
  amount: z.number({ error: "Importe no válido" }).int().positive("El importe debe ser positivo"),
  fees: z.number().int().min(0).default(0),
  units: z.string().optional().nullable().transform(normalizeDecimalInput),
  price: z.string().optional().nullable().transform(normalizeDecimalInput),
  cashTransactionId: z.string().optional().transform((v) => v || null),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
});
export type InvestmentTxInput = z.input<typeof investmentTxSchema>;

/** Importe esperado del movimiento bancario que financia/recibe una operación. */
export function expectedCashAmount(t: { type: InvTx["type"]; amount: number; fees: number }): number {
  switch (t.type) {
    case "BUY":
      return -(t.amount + t.fees);
    case "FEE":
      return -t.amount;
    default:
      return t.amount - t.fees;
  }
}

async function investmentsCategory(db: Db, userId: string, type: InvTx["type"]) {
  const cat = await db.category.findFirst({ where: { userId, kind: "INVESTMENT" }, orderBy: { isSystem: "desc" }, include: { subcategories: true } });
  if (!cat) return { categoryId: null, subcategoryId: null };
  const wanted = type === "BUY" ? "Aportación fondo" : type === "SELL" ? "Retirada/reembolso" : null;
  const sub = cat.subcategories.find((s) => s.name === wanted) ?? null;
  return { categoryId: cat.id, subcategoryId: sub?.id ?? null };
}

export async function addInvestmentTransaction(db: Db, userId: string, investmentId: string, input: InvestmentTxInput): Promise<InvestmentTransaction> {
  const data = parse(investmentTxSchema, input);
  return inTransaction(db, async (tx) => {
    const inv = await tx.investment.findFirst({ where: { id: investmentId, userId }, include: { transactions: true, prices: true } });
    if (!inv) throw new UserError("La inversión no existe.");

    let units: string | null = null;
    let price: string | null = null;
    try {
      if ((data.type === "BUY" || data.type === "SELL") && inv.valuationMode === "UNITS") {
        ({ units, price } = completeTrade({ amount: data.amount, units: data.units, price: data.price }));
      }
    } catch (e) {
      if (e instanceof InvestmentDataError) throw new UserError(e.message, { units: e.message });
      throw e;
    }

    // Vínculo con el movimiento bancario (trazabilidad del dinero).
    if (data.cashTransactionId) {
      const cash = await tx.transaction.findFirst({
        where: { id: data.cashTransactionId, userId },
        include: { investmentTransaction: true },
      });
      if (!cash) throw new UserError("El movimiento bancario no existe.");
      if (cash.investmentTransaction) throw new UserError("Ese movimiento bancario ya está vinculado a otra operación.");
      if (cash.transferPeerId) throw new UserError("Ese movimiento es una transferencia interna vinculada.");
      const expected = expectedCashAmount({ type: data.type, amount: data.amount, fees: data.fees });
      if (cash.amount !== expected) {
        throw new UserError(`El movimiento bancario es de ${formatMoney(cash.amount)} y la operación implica ${formatMoney(expected)}.`);
      }
    }

    const created = await tx.investmentTransaction.create({
      data: { investmentId, type: data.type, date: data.date, amount: data.amount, fees: data.fees, units, price, cashTransactionId: data.cashTransactionId, notes: data.notes },
    });

    // La operación debe dejar la posición en un estado posible (p.ej. no vender más de lo que hay).
    const check = safePosition(inv, [...inv.transactions, created], inv.prices, new Date(8640000000000000));
    if (check.error) throw new UserError(check.error);

    if (data.cashTransactionId) {
      const before = await tx.transaction.findUniqueOrThrow({ where: { id: data.cashTransactionId } });
      const after = await tx.transaction.update({
        where: { id: data.cashTransactionId },
        data: { kind: "INVESTMENT", ...(await investmentsCategory(tx, userId, data.type)), categorizationSource: "MANUAL", ruleId: null },
      });
      await writeAudit(tx, { userId, entity: "Transaction", entityId: before.id, action: "link", before, after });
    }
    await writeAudit(tx, { userId, entity: "InvestmentTransaction", entityId: created.id, action: "create", after: created });
    return created;
  });
}

export async function deleteInvestmentTransaction(db: Db, userId: string, id: string) {
  await inTransaction(db, async (tx) => {
    const t = await tx.investmentTransaction.findFirst({ where: { id, investment: { userId } } });
    if (!t) throw new UserError("La operación no existe.");
    const inv = await tx.investment.findUniqueOrThrow({ where: { id: t.investmentId }, include: { transactions: true, prices: true } });
    const rest = inv.transactions.filter((x) => x.id !== id);
    const check = safePosition(inv, rest, inv.prices, new Date(8640000000000000));
    if (check.error) throw new UserError(`No se puede borrar: ${check.error}`);
    if (t.cashTransactionId) {
      const cash = await tx.transaction.findUnique({ where: { id: t.cashTransactionId } });
      if (cash) {
        await tx.transaction.update({
          where: { id: cash.id },
          data: { kind: defaultKindForAmount(cash.amount), categoryId: null, subcategoryId: null, categorizationSource: "NONE", reviewed: false },
        });
      }
    }
    await tx.investmentTransaction.delete({ where: { id } });
    await writeAudit(tx, { userId, entity: "InvestmentTransaction", entityId: id, action: "delete", before: t });
  });
}

/** Movimientos bancarios que podrían financiar una operación (importe exacto, ±5 días). */
export async function cashCandidates(db: Db, userId: string, input: { type: InvTx["type"]; amount: number; fees: number; date: Date }) {
  const window = 5 * 86_400_000;
  return db.transaction.findMany({
    where: {
      userId,
      amount: expectedCashAmount(input),
      transferPeerId: null,
      investmentTransaction: null,
      date: { gte: new Date(input.date.getTime() - window), lte: new Date(input.date.getTime() + window) },
    },
    include: { account: { select: { name: true } } },
    orderBy: { date: "asc" },
  });
}

/**
 * Movimientos bancarios que pueden financiar/recibir operaciones de esta
 * inversión: los de su cuenta de broker y los ya marcados como inversión,
 * sin vincular. El importe exacto se valida al guardar.
 */
export async function linkableMovements(db: Db, userId: string, accountId: string | null) {
  return db.transaction.findMany({
    where: {
      userId,
      investmentTransaction: null,
      transferPeerId: null,
      OR: [{ kind: "INVESTMENT" }, { category: { kind: "INVESTMENT" } }, ...(accountId ? [{ accountId }] : [])],
    },
    include: { account: { select: { name: true } } },
    orderBy: { date: "desc" },
    take: 60,
  });
}

// -----------------------------------------------------------------------------
// Valoraciones (histórico, nunca se sobrescribe)
// -----------------------------------------------------------------------------

export const priceInputSchema = z
  .object({
    date: z.date({ error: "Fecha no válida" }),
    price: z.string().optional().nullable().transform(normalizeDecimalInput),
    totalValue: z.number().int().min(0).nullable().default(null),
  })
  .refine((p) => p.price === null || /^\d+(\.\d+)?$/.test(p.price), { message: "Valor liquidativo no válido", path: ["price"] })
  .refine((p) => p.price === null || Number(p.price) > 0, { message: "El valor liquidativo debe ser positivo", path: ["price"] });

export async function addInvestmentPrice(db: Db, userId: string, investmentId: string, input: z.input<typeof priceInputSchema>) {
  const data = parse(priceInputSchema, input);
  const inv = await db.investment.findFirst({ where: { id: investmentId, userId } });
  if (!inv) throw new UserError("La inversión no existe.");
  if (inv.valuationMode === "UNITS" && !data.price) throw new UserError("Indica el valor liquidativo (precio por participación).", { price: "Obligatorio" });
  if (inv.valuationMode === "TOTAL_VALUE" && data.totalValue === null) throw new UserError("Indica el valor total de la inversión.", { totalValue: "Obligatorio" });
  try {
    return await inTransaction(db, async (tx) => {
      const p = await tx.investmentPrice.create({
        data: {
          investmentId,
          date: data.date,
          price: inv.valuationMode === "UNITS" ? data.price : null,
          totalValue: inv.valuationMode === "TOTAL_VALUE" ? data.totalValue : null,
          source: "MANUAL",
        },
      });
      await writeAudit(tx, { userId, entity: "InvestmentPrice", entityId: p.id, action: "create", after: p });
      return p;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError(`Ya hay una valoración el ${formatDateES(data.date)}. Bórrala primero si quieres corregirla.`);
    throw e;
  }
}

export async function deleteInvestmentPrice(db: Db, userId: string, priceId: string) {
  await inTransaction(db, async (tx) => {
    const p = await tx.investmentPrice.findFirst({ where: { id: priceId, investment: { userId } } });
    if (!p) throw new UserError("La valoración no existe.");
    await tx.investmentPrice.delete({ where: { id: priceId } });
    await writeAudit(tx, { userId, entity: "InvestmentPrice", entityId: priceId, action: "delete", before: p });
  });
}

// -----------------------------------------------------------------------------
// Lectura: detalle y cartera
// -----------------------------------------------------------------------------

export async function getInvestmentDetail(db: Db, userId: string, id: string, asOf: Date) {
  const inv = await db.investment.findFirst({
    where: { id, userId },
    include: {
      account: { select: { id: true, name: true } },
      transactions: { orderBy: { date: "desc" }, include: { cashTransaction: { include: { account: { select: { name: true } } } } } },
      prices: { orderBy: { date: "desc" } },
    },
  });
  if (!inv) throw new UserError("La inversión no existe.");
  const { position, error } = safePosition(inv, inv.transactions, inv.prices, asOf);
  const txs = inv.transactions.map(toInvTx);
  const flows = position ? investmentCashFlows(txs, position) : null;
  return {
    inv,
    position,
    error,
    irr: flows ? xirr(flows) : null,
    series: position ? monthlySeries(txs, inv.prices.map(toInvPrice), inv.valuationMode, asOf) : [],
  };
}

export interface PortfolioRow {
  inv: Investment & { account: { id: string; name: string } | null };
  position: Position | null;
  error?: string;
  irr: number | null;
}

export interface Portfolio {
  asOf: Date;
  rows: PortfolioRow[];
  /** Suma de valores; incompleta si alguna inversión no tiene valoración. */
  value: number;
  complete: boolean;
  contributed: number;
  withdrawn: number;
  totalGain: number | null;
  simpleReturn: number | null;
  irr: number | null;
  stale: PortfolioRow[];
  series: MonthPoint[];
  byType: Array<{ key: string; label: string; value: number }>;
  byInvestment: Array<{ key: string; label: string; value: number }>;
  byPlatform: Array<{ key: string; label: string; value: number }>;
}

export async function getPortfolio(db: Db, userId: string, asOf: Date, opts: { includeArchived?: boolean } = {}): Promise<Portfolio> {
  const invs = await db.investment.findMany({
    where: { userId, ...(opts.includeArchived ? {} : { archived: false }) },
    include: { account: { select: { id: true, name: true } }, transactions: true, prices: true },
    orderBy: { name: "asc" },
  });

  const rows: PortfolioRow[] = [];
  const allFlows: CashFlow[] = [];
  let value = 0;
  let complete = true;
  let contributed = 0;
  let withdrawn = 0;
  const seriesByMonth = new Map<string, MonthPoint>();

  for (const inv of invs) {
    const { position, error } = safePosition(inv, inv.transactions, inv.prices, asOf);
    const txs = inv.transactions.map(toInvTx);
    const flows = position ? investmentCashFlows(txs, position) : null;
    rows.push({ inv, position, error, irr: flows ? xirr(flows) : null });
    if (!position || position.transactionIds.length === 0) {
      if (!position) complete = false;
      continue;
    }
    contributed += position.contributed;
    withdrawn += position.withdrawn;
    if (position.value === null) complete = false;
    else value += position.value;
    if (flows) allFlows.push(...flows);
    for (const p of monthlySeries(txs, inv.prices.map(toInvPrice), inv.valuationMode, asOf)) {
      const s = seriesByMonth.get(p.month) ?? { month: p.month, value: 0, contributedCumulative: 0, netContribution: 0 };
      s.value = s.value === null || p.value === null ? null : s.value + p.value;
      s.contributedCumulative += p.contributedCumulative;
      s.netContribution += p.netContribution;
      seriesByMonth.set(p.month, s);
    }
  }

  // Cada inversión aporta puntos desde su primera operación hasta `asOf`; antes de
  // empezar su valor y aportado son 0, así que la suma por mes no tiene huecos.
  const series = [...seriesByMonth.values()].sort((a, b) => a.month.localeCompare(b.month));

  const totalGain = complete ? value + withdrawn - contributed : null;
  const group = (keyOf: (r: PortfolioRow) => [string, string]) => {
    const m = new Map<string, { key: string; label: string; value: number }>();
    for (const r of rows) {
      if (!r.position?.value) continue;
      const [key, label] = keyOf(r);
      const g = m.get(key) ?? { key, label, value: 0 };
      g.value += r.position.value;
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  };

  return {
    asOf,
    rows,
    value,
    complete,
    contributed,
    withdrawn,
    totalGain,
    simpleReturn: totalGain === null || contributed === 0 ? null : percentage(totalGain, contributed),
    irr: complete ? xirr(allFlows) : null,
    stale: rows.filter((r) => r.position?.stale && (r.position.value ?? 0) > 0),
    series,
    byType: group((r) => [r.inv.assetType, ASSET_TYPE_LABELS[r.inv.assetType]]),
    byInvestment: group((r) => [r.inv.id, r.inv.name]),
    byPlatform: group((r) => [r.inv.platform ?? "—", r.inv.platform ?? "Sin plataforma"]),
  };
}
