import { percentage, type Cents } from "./money";

/**
 * Reglas contables de ingresos, gastos y ahorro (docs/ARQUITECTURA.md §7).
 *
 * - INCOME      -> suma a ingresos.
 * - EXPENSE     -> suma a gastos. Un importe POSITIVO con tipo EXPENSE es un
 *                  reembolso de una compra (p.ej. devolución de Amazon) y
 *                  RESTA gasto en su categoría en vez de contar como ingreso.
 * - TRANSFER    -> excluido (movimiento entre cuentas propias).
 * - INVESTMENT  -> excluido de gastos; se informa aparte como "aportado a inversión".
 * - ADJUSTMENT  -> excluido (ajuste de conciliación).
 *
 * Todas las cifras devuelven las IDs de las operaciones que las componen,
 * para poder pulsar un número y ver su origen.
 */

export type TxKind = "INCOME" | "EXPENSE" | "TRANSFER" | "INVESTMENT" | "ADJUSTMENT";

export interface CashflowTx {
  id: string;
  amount: Cents;
  kind: TxKind;
}

export interface TracedAmount {
  total: Cents;
  transactionIds: string[];
}

export interface CashflowSummary {
  income: TracedAmount;
  /** Gastos como número POSITIVO (neto de reembolsos). */
  expenses: TracedAmount;
  savings: Cents;
  /** ahorro / ingresos × 100; null si no hay ingresos ("Pendiente de datos"). */
  savingsRate: number | null;
  /** Aportado neto a inversión (positivo = dinero que salió hacia inversión). */
  investedNet: TracedAmount;
  /** Movimientos excluidos (transferencias internas y ajustes), por trazabilidad. */
  excluded: TracedAmount;
}

function traced(): TracedAmount {
  return { total: 0, transactionIds: [] };
}

export function summarizeCashflow(transactions: Iterable<CashflowTx>): CashflowSummary {
  const income = traced();
  const expenses = traced();
  const investedNet = traced();
  const excluded = traced();

  for (const tx of transactions) {
    switch (tx.kind) {
      case "INCOME":
        income.total += tx.amount;
        income.transactionIds.push(tx.id);
        break;
      case "EXPENSE":
        expenses.total += -tx.amount;
        expenses.transactionIds.push(tx.id);
        break;
      case "INVESTMENT":
        investedNet.total += -tx.amount;
        investedNet.transactionIds.push(tx.id);
        break;
      case "TRANSFER":
      case "ADJUSTMENT":
        excluded.total += tx.amount;
        excluded.transactionIds.push(tx.id);
        break;
    }
  }

  const savings = income.total - expenses.total;
  const savingsRate = income.total > 0 ? percentage(savings, income.total) : null;
  return { income, expenses, savings, savingsRate, investedNet, excluded };
}
