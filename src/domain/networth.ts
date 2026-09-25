import type { AccountType } from "./accounts";
import { percentage, type Cents } from "./money";

/**
 * Patrimonio neto = activos − pasivos (docs/ARQUITECTURA.md §9).
 *
 * Regla de oro: si falta el valor de algún componente, el total se marca
 * INCOMPLETO y se lista qué falta. Nunca se sustituye por 0 ni se estima.
 */

/** Grupos de la distribución del patrimonio (§4). */
export type DistributionGroup =
  | "CASH"
  | "BANK"
  | "INDEX_FUNDS"
  | "OTHER_FUNDS"
  | "STOCKS"
  | "PLANS"
  | "INVESTMENT_OTHER"
  | "OTHER_ASSETS";

export const DISTRIBUTION_LABELS: Record<DistributionGroup, string> = {
  CASH: "Efectivo",
  BANK: "Cuentas bancarias",
  INDEX_FUNDS: "Fondos indexados",
  OTHER_FUNDS: "Otros fondos",
  STOCKS: "Acciones y ETF",
  PLANS: "Planes y seguros de inversión",
  INVESTMENT_OTHER: "Otras inversiones",
  OTHER_ASSETS: "Otros activos",
};

export type NetWorthBucket = "LIQUIDITY" | "INVESTMENTS" | "OTHER_ASSETS";

export interface AssetItem {
  id: string;
  name: string;
  kind: "account" | "investment";
  group: DistributionGroup;
  bucket: NetWorthBucket;
  currency: string;
  /** null = no se conoce el valor a esa fecha. */
  value: Cents | null;
  /** Por qué falta el valor. */
  pendingReason?: string;
  /** Fecha del dato usado (saldo, valoración). */
  asOf?: Date | null;
}

export interface LiabilityItem {
  id: string;
  name: string;
  value: Cents | null;
  pendingReason?: string;
  asOf?: Date | null;
}

export interface NetWorth {
  assets: Cents;
  liabilities: Cents;
  netWorth: Cents;
  liquidity: Cents;
  investments: Cents;
  otherAssets: Cents;
  distribution: Array<{ group: DistributionGroup; value: Cents; share: number | null; itemIds: string[] }>;
  /** Componentes sin valor o en otra moneda: no incluidos en los totales. */
  pending: Array<{ id: string; name: string; reason: string }>;
  complete: boolean;
}

/** Grupo de distribución y bloque patrimonial de una cuenta. */
export function accountGroup(type: AccountType): { group: DistributionGroup; bucket: NetWorthBucket } {
  switch (type) {
    case "CASH":
      return { group: "CASH", bucket: "LIQUIDITY" };
    case "CHECKING":
    case "SAVINGS":
    case "BROKER":
    case "CARD":
      return { group: "BANK", bucket: "LIQUIDITY" };
    case "INVESTMENT":
      return { group: "INVESTMENT_OTHER", bucket: "INVESTMENTS" };
    case "OTHER":
      return { group: "OTHER_ASSETS", bucket: "OTHER_ASSETS" };
  }
}

export function computeNetWorth(assets: AssetItem[], liabilities: LiabilityItem[], baseCurrency = "EUR"): NetWorth {
  const pending: NetWorth["pending"] = [];
  let assetsTotal = 0;
  let debts = 0;
  const buckets: Record<NetWorthBucket, Cents> = { LIQUIDITY: 0, INVESTMENTS: 0, OTHER_ASSETS: 0 };
  const dist = new Map<DistributionGroup, { value: Cents; itemIds: string[] }>();

  for (const a of assets) {
    if (a.currency !== baseCurrency) {
      pending.push({ id: a.id, name: a.name, reason: `En ${a.currency}: falta el tipo de cambio.` });
      continue;
    }
    if (a.value === null) {
      pending.push({ id: a.id, name: a.name, reason: a.pendingReason ?? "Sin valor a esta fecha." });
      continue;
    }
    // Un saldo negativo (tarjeta, descubierto) es deuda, no un activo negativo.
    if (a.value < 0) {
      debts += -a.value;
      continue;
    }
    assetsTotal += a.value;
    buckets[a.bucket] += a.value;
    const d = dist.get(a.group) ?? { value: 0, itemIds: [] };
    d.value += a.value;
    d.itemIds.push(a.id);
    dist.set(a.group, d);
  }

  for (const l of liabilities) {
    if (l.value === null) {
      pending.push({ id: l.id, name: l.name, reason: l.pendingReason ?? "Sin saldo pendiente registrado." });
      continue;
    }
    debts += l.value;
  }

  const distribution = [...dist.entries()]
    .map(([group, d]) => ({ group, value: d.value, share: percentage(d.value, assetsTotal), itemIds: d.itemIds }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  return {
    assets: assetsTotal,
    liabilities: debts,
    netWorth: assetsTotal - debts,
    liquidity: buckets.LIQUIDITY,
    investments: buckets.INVESTMENTS,
    otherAssets: buckets.OTHER_ASSETS,
    distribution,
    pending,
    complete: pending.length === 0,
  };
}

export interface Change {
  /** Diferencia absoluta; null si alguno de los dos extremos está incompleto. */
  delta: Cents | null;
  /** Variación relativa en %; null si no calculable. */
  pct: number | null;
  reason?: string;
}

/** Variación entre dos fotos. Si alguna está incompleta, no se calcula (no se inventa). */
export function compareNetWorth(current: NetWorth, previous: NetWorth | null): Change {
  if (!previous) return { delta: null, pct: null, reason: "No hay datos de esa fecha." };
  if (!current.complete || !previous.complete) {
    return { delta: null, pct: null, reason: "Faltan datos en alguna de las dos fechas." };
  }
  const delta = current.netWorth - previous.netWorth;
  const pct = previous.netWorth > 0 ? percentage(delta, previous.netWorth) : null;
  return { delta, pct };
}
