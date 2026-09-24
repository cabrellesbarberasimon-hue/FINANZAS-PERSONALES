import type { TxKind } from "./cashflow";

export const TX_KIND_LABELS: Record<TxKind, string> = {
  INCOME: "Ingreso",
  EXPENSE: "Gasto",
  TRANSFER: "Transferencia interna",
  INVESTMENT: "Inversión",
  ADJUSTMENT: "Ajuste",
};

export const TX_KINDS = Object.keys(TX_KIND_LABELS) as TxKind[];

export type CategoryKind = "EXPENSE" | "INCOME" | "TRANSFER" | "INVESTMENT";

/** El tipo de movimiento lo fija la categoría cuando la hay. */
export function kindForCategory(kind: CategoryKind): TxKind {
  return kind;
}

/** Tipo por defecto de un movimiento sin categoría, según su signo. */
export function defaultKindForAmount(amount: number): TxKind {
  return amount >= 0 ? "INCOME" : "EXPENSE";
}

export type KindCheck = { ok: true; warning?: string } | { ok: false; reason: string };

/** Coherencia entre tipo e importe. */
export function checkKindAmount(kind: TxKind, amount: number): KindCheck {
  if (amount === 0) return { ok: false, reason: "El importe no puede ser 0." };
  if (kind === "INCOME" && amount < 0) {
    return { ok: false, reason: "Un ingreso no puede ser una salida de dinero." };
  }
  if (kind === "EXPENSE" && amount > 0) {
    return { ok: true, warning: "Gasto con importe positivo: se tratará como reembolso y restará gasto." };
  }
  return { ok: true };
}
