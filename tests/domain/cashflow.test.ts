import { describe, expect, it } from "vitest";
import { summarizeCashflow, type CashflowTx } from "@/domain/cashflow";

describe("ahorro y transferencias internas", () => {
  const month: CashflowTx[] = [
    { id: "nomina", amount: 250000, kind: "INCOME" },
    { id: "alquiler", amount: -80000, kind: "EXPENSE" },
    { id: "super", amount: -30000, kind: "EXPENSE" },
    { id: "devolucion-amazon", amount: 5000, kind: "EXPENSE" },
    // Transferencia interna: -500 € banco, +500 € broker
    { id: "tr-salida", amount: -50000, kind: "TRANSFER" },
    { id: "tr-entrada", amount: 50000, kind: "TRANSFER" },
    { id: "aportacion-fondo", amount: -30000, kind: "INVESTMENT" },
  ];

  it("excluye transferencias de ingresos, gastos y ahorro", () => {
    const s = summarizeCashflow(month);
    expect(s.income.total).toBe(250000);
    expect(s.expenses.total).toBe(105000); // 800 + 300 - 50 de reembolso
    expect(s.savings).toBe(145000);
    expect(s.savingsRate).toBeCloseTo(58, 10);
    expect(s.excluded.transactionIds).toEqual(["tr-salida", "tr-entrada"]);
    expect(s.excluded.total).toBe(0);
  });

  it("la aportación a inversión no es gasto y se informa aparte", () => {
    const s = summarizeCashflow(month);
    expect(s.expenses.transactionIds).not.toContain("aportacion-fondo");
    expect(s.investedNet.total).toBe(30000);
  });

  it("cada cifra es trazable a sus operaciones", () => {
    const s = summarizeCashflow(month);
    expect(s.expenses.transactionIds).toEqual(["alquiler", "super", "devolucion-amazon"]);
    expect(s.income.transactionIds).toEqual(["nomina"]);
  });

  it("sin ingresos la tasa de ahorro es 'pendiente' (null), no 0 ni infinito", () => {
    const s = summarizeCashflow([{ id: "x", amount: -1000, kind: "EXPENSE" }]);
    expect(s.savingsRate).toBeNull();
    expect(s.savings).toBe(-1000);
  });
});
