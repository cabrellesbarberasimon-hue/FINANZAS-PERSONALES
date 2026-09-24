import type { Cents } from "./money";

/**
 * Tipos de cuenta, su agrupación patrimonial y cómo se obtiene su saldo.
 * (docs/ARQUITECTURA.md §2 y §9)
 */

export type AccountType = "CHECKING" | "SAVINGS" | "CASH" | "CARD" | "BROKER" | "INVESTMENT" | "OTHER";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: "Cuenta corriente",
  SAVINGS: "Cuenta remunerada",
  CASH: "Efectivo",
  CARD: "Tarjeta",
  BROKER: "Broker (efectivo)",
  INVESTMENT: "Inversión (valor manual)",
  OTHER: "Otros activos",
};

export const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[];

/** Grupo patrimonial de una cuenta. */
export type AssetGroup = "LIQUIDITY" | "INVESTMENT" | "OTHER_ASSET" | "CARD";

export function assetGroup(type: AccountType): AssetGroup {
  switch (type) {
    case "CHECKING":
    case "SAVINGS":
    case "CASH":
    case "BROKER":
      return "LIQUIDITY";
    case "INVESTMENT":
      return "INVESTMENT";
    case "OTHER":
      return "OTHER_ASSET";
    case "CARD":
      return "CARD";
  }
}

/**
 * - TRANSACTIONS: saldo = saldo inicial + movimientos (cuentas con extracto).
 * - DECLARED: saldo = última valoración introducida (vivienda, PIAS sin detalle...).
 */
export type BalanceMethod = "TRANSACTIONS" | "DECLARED";

export function balanceMethod(type: AccountType): BalanceMethod {
  return type === "INVESTMENT" || type === "OTHER" ? "DECLARED" : "TRANSACTIONS";
}

export interface BalanceTx {
  id: string;
  date: Date;
  amount: Cents;
}

export interface DeclaredBalance {
  date: Date;
  balance: Cents;
}

export interface ComputedBalance {
  balance: Cents;
  /** Fecha a la que corresponde el saldo (null = sin datos). */
  asOf: Date | null;
  /** Movimientos que forman el saldo (trazabilidad). */
  transactionIds: string[];
  /** Movimientos con fecha <= saldo inicial: se consideran ya incluidos en él. */
  ignoredBeforeOpening: string[];
}

/**
 * Saldo calculado al FINAL del día `at`.
 *
 * Convención: `openingBalance` es el saldo al FINAL del día `openingDate`, por
 * lo que los movimientos de ese día o anteriores ya están incluidos en él y
 * no se vuelven a sumar.
 */
export function computeBalance(
  opening: { balance: Cents; date: Date },
  transactions: Iterable<BalanceTx>,
  at?: Date,
): ComputedBalance {
  let balance = opening.balance;
  let asOf = opening.date;
  const transactionIds: string[] = [];
  const ignoredBeforeOpening: string[] = [];
  for (const tx of transactions) {
    if (tx.date.getTime() <= opening.date.getTime()) {
      ignoredBeforeOpening.push(tx.id);
      continue;
    }
    if (at && tx.date.getTime() > at.getTime()) continue;
    balance += tx.amount;
    transactionIds.push(tx.id);
    if (tx.date > asOf) asOf = tx.date;
  }
  if (at && at > asOf) asOf = at;
  return { balance, asOf, transactionIds, ignoredBeforeOpening };
}

/** Última valoración declarada en o antes de `at`. */
export function latestDeclared(
  declared: DeclaredBalance[],
  at?: Date,
): DeclaredBalance | null {
  let best: DeclaredBalance | null = null;
  for (const d of declared) {
    if (at && d.date > at) continue;
    if (!best || d.date > best.date) best = d;
  }
  return best;
}

export interface ReconciliationRow {
  date: Date;
  declared: Cents;
  computed: Cents;
  /** declarado − calculado. 0 = cuadra. */
  difference: Cents;
}

/**
 * Compara cada saldo declarado con el saldo calculado a esa fecha.
 * Solo tiene sentido en cuentas con método TRANSACTIONS.
 */
export function reconcile(
  opening: { balance: Cents; date: Date },
  transactions: BalanceTx[],
  declared: DeclaredBalance[],
): ReconciliationRow[] {
  return [...declared]
    .filter((d) => d.date >= opening.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((d) => {
      const computed = computeBalance(opening, transactions, d.date).balance;
      return { date: d.date, declared: d.balance, computed, difference: d.balance - computed };
    });
}
