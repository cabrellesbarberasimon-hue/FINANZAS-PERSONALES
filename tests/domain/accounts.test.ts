import { describe, expect, it } from "vitest";
import { assetGroup, balanceMethod, computeBalance, latestDeclared, reconcile } from "@/domain/accounts";
import { utcDate } from "@/domain/dates";

const opening = { balance: 100000, date: utcDate(2026, 1, 31) };
const txs = [
  { id: "antes", date: utcDate(2026, 1, 20), amount: -5000 }, // ya incluido en el saldo inicial
  { id: "mismo-dia", date: utcDate(2026, 1, 31), amount: -700 }, // ya incluido
  { id: "nomina", date: utcDate(2026, 2, 1), amount: 250000 },
  { id: "super", date: utcDate(2026, 2, 3), amount: -4523 },
  { id: "alquiler", date: utcDate(2026, 3, 1), amount: -80000 },
];

describe("saldo calculado", () => {
  it("saldo inicial + movimientos posteriores a la fecha del saldo inicial", () => {
    const r = computeBalance(opening, txs);
    expect(r.balance).toBe(100000 + 250000 - 4523 - 80000);
    expect(r.transactionIds).toEqual(["nomina", "super", "alquiler"]);
    expect(r.ignoredBeforeOpening).toEqual(["antes", "mismo-dia"]);
  });

  it("saldo a una fecha concreta (final del día)", () => {
    expect(computeBalance(opening, txs, utcDate(2026, 2, 3)).balance).toBe(100000 + 250000 - 4523);
    expect(computeBalance(opening, txs, utcDate(2026, 2, 2)).balance).toBe(350000);
  });

  it("sin movimientos, el saldo es el inicial", () => {
    expect(computeBalance(opening, []).balance).toBe(100000);
  });
});

describe("conciliación", () => {
  it("detecta la diferencia entre saldo del banco y saldo calculado", () => {
    const rows = reconcile(opening, txs, [
      { date: utcDate(2026, 2, 3), balance: 345477 }, // cuadra
      { date: utcDate(2026, 3, 1), balance: 280477 }, // falta un movimiento de +150 €
    ]);
    expect(rows.map((r) => r.difference)).toEqual([0, 15000]);
  });

  it("ignora saldos declarados anteriores al saldo inicial", () => {
    expect(reconcile(opening, txs, [{ date: utcDate(2026, 1, 1), balance: 1 }])).toEqual([]);
  });
});

describe("clasificación", () => {
  it("agrupa tipos de cuenta", () => {
    expect(assetGroup("SAVINGS")).toBe("LIQUIDITY");
    expect(assetGroup("BROKER")).toBe("LIQUIDITY");
    expect(assetGroup("CARD")).toBe("CARD");
    expect(balanceMethod("OTHER")).toBe("DECLARED");
    expect(balanceMethod("CHECKING")).toBe("TRANSACTIONS");
  });
  it("latestDeclared toma la última valoración en o antes de la fecha", () => {
    const d = [
      { date: utcDate(2026, 1, 1), balance: 1 },
      { date: utcDate(2026, 3, 1), balance: 3 },
      { date: utcDate(2026, 2, 1), balance: 2 },
    ];
    expect(latestDeclared(d)?.balance).toBe(3);
    expect(latestDeclared(d, utcDate(2026, 2, 15))?.balance).toBe(2);
    expect(latestDeclared(d, utcDate(2025, 12, 1))).toBeNull();
  });
});
