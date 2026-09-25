import { describe, expect, it } from "vitest";
import { utcDate } from "@/domain/dates";
import {
  completeTrade,
  computePosition,
  investmentCashFlows,
  isValidIsin,
  monthlySeries,
  xirr,
  type InvPrice,
  type InvTx,
} from "@/domain/investments";

let n = 0;
const buy = (d: Date, amount: number, units: string, price: string, fees = 0): InvTx => ({
  id: `b${n++}`, date: d, type: "BUY", units, price, amount, fees,
});
const nav = (d: Date, price: string): InvPrice => ({ date: d, price, totalValue: null });

describe("fondo indexado con aportaciones periódicas (ejemplo del enunciado)", () => {
  // 300 € el día 1 de enero, febrero y marzo de 2026 a VL 105,34 / 107,21 / 104,82
  const txs = [
    buy(utcDate(2026, 1, 1), 30000, "2.847921", "105.34"),
    buy(utcDate(2026, 2, 1), 30000, "2.798246", "107.21"),
    buy(utcDate(2026, 3, 1), 30000, "2.862049", "104.82"),
  ];
  const prices = [nav(utcDate(2026, 1, 1), "105.34"), nav(utcDate(2026, 2, 1), "107.21"), nav(utcDate(2026, 3, 1), "104.82"), nav(utcDate(2026, 3, 31), "110.00")];

  it("capital aportado, participaciones acumuladas y precio medio", () => {
    const p = computePosition(txs, prices, "UNITS", utcDate(2026, 3, 31));
    expect(p.contributed).toBe(90000);
    expect(p.units.toString()).toBe("8.508216");
    expect(p.averagePrice!.toFixed(4)).toBe("105.7801"); // 900 € / 8,508216
  });

  it("valor actual, ganancia y rentabilidad simple", () => {
    const p = computePosition(txs, prices, "UNITS", utcDate(2026, 3, 31));
    expect(p.value).toBe(93590); // 8,508216 × 110,00 = 935,90 €
    expect(p.totalGain).toBe(3590);
    expect(p.simpleReturn).toBeCloseTo(3.9889, 3);
    expect(p.valuation).toMatchObject({ source: "PRICE" });
  });

  it("una nueva aportación NO se interpreta como rentabilidad", () => {
    const before = computePosition(txs, prices, "UNITS", utcDate(2026, 3, 31));
    const more = [...txs, buy(utcDate(2026, 3, 31), 30000, "2.727273", "110.00")];
    const after = computePosition(more, prices, "UNITS", utcDate(2026, 3, 31));
    expect(after.contributed - before.contributed).toBe(30000);
    expect(after.value! - before.value!).toBe(30000);
    expect(after.totalGain).toBe(before.totalGain);
  });

  it("valor a una fecha pasada usa el VL de esa fecha (histórico, no el último)", () => {
    const feb = computePosition(txs, prices, "UNITS", utcDate(2026, 2, 15));
    expect(feb.contributed).toBe(60000);
    expect(feb.value).toBe(Math.round(5.646167 * 107.21 * 100));
  });
});

describe("ejemplo: aportado 10.000 €, valor 11.250 € -> +1.250 € (+12,5 %)", () => {
  it("modo valor total (PIAS / plan)", () => {
    const p = computePosition(
      [{ id: "a", date: utcDate(2025, 1, 1), type: "BUY", units: null, price: null, amount: 1000000, fees: 0 }],
      [{ date: utcDate(2026, 9, 1), price: null, totalValue: 1125000 }],
      "TOTAL_VALUE",
      utcDate(2026, 9, 24),
    );
    expect(p.totalGain).toBe(125000);
    expect(p.simpleReturn).toBe(12.5);
  });
});

describe("ventas, dividendos y comisiones", () => {
  it("venta con coste medio: ganancia realizada y coste restante", () => {
    const txs: InvTx[] = [
      buy(utcDate(2026, 1, 1), 100000, "10", "100"),
      buy(utcDate(2026, 2, 1), 120000, "10", "120"),
      { id: "s", date: utcDate(2026, 3, 1), type: "SELL", units: "5", price: "130", amount: 65000, fees: 0 },
      { id: "d", date: utcDate(2026, 3, 15), type: "DIVIDEND", units: null, price: null, amount: 1000, fees: 0 },
      { id: "f", date: utcDate(2026, 3, 20), type: "FEE", units: null, price: null, amount: 500, fees: 0 },
    ];
    const p = computePosition(txs, [nav(utcDate(2026, 3, 31), "130")], "UNITS", utcDate(2026, 3, 31));
    expect(p.units.toString()).toBe("15");
    expect(p.costBasis).toBe(165000); // 220.000 − 5 × 110 €
    expect(p.realizedGain).toBe(65000 - 55000 + 1000 - 500);
    expect(p.contributed).toBe(220500);
    expect(p.withdrawn).toBe(66000);
    expect(p.value).toBe(195000);
    expect(p.totalGain).toBe(195000 + 66000 - 220500);
  });

  it("no se puede vender más de lo que se tiene", () => {
    expect(() =>
      computePosition([{ id: "s", date: utcDate(2026, 1, 1), type: "SELL", units: "1", price: "1", amount: 100, fees: 0 }], [], "UNITS", utcDate(2026, 1, 2)),
    ).toThrow(/Venta/);
  });
});

describe("sin valoración: pendiente de datos, nunca se inventa", () => {
  it("sin precio ni en compras ni en histórico -> value null", () => {
    const p = computePosition(
      [{ id: "a", date: utcDate(2026, 1, 1), type: "BUY", units: "1", price: null, amount: 1000, fees: 0 }],
      [],
      "UNITS",
      utcDate(2026, 2, 1),
    );
    expect(p.value).toBeNull();
    expect(p.totalGain).toBeNull();
    expect(p.simpleReturn).toBeNull();
  });
  it("el precio de la última compra es un dato real y sirve de valoración", () => {
    const p = computePosition([buy(utcDate(2026, 1, 1), 10000, "100", "1")], [], "UNITS", utcDate(2026, 1, 10));
    expect(p.value).toBe(10000);
    expect(p.valuation?.source).toBe("TRANSACTION");
  });
  it("valoración de más de 35 días -> desactualizada", () => {
    const p = computePosition([buy(utcDate(2026, 1, 1), 10000, "100", "1")], [], "UNITS", utcDate(2026, 3, 1));
    expect(p.stale).toBe(true);
  });
});

describe("TIR (rentabilidad ponderada por aportaciones)", () => {
  it("1.000 € que valen 1.100 € un año después -> 10 %", () => {
    const r = xirr([
      { date: utcDate(2025, 1, 1), amount: -1000 },
      { date: utcDate(2026, 1, 1), amount: 1100 },
    ]);
    expect(r).toBeCloseTo(0.1, 6);
  });
  it("aportaciones periódicas: coincide con la solución de referencia", () => {
    const flows = [
      { date: utcDate(2025, 1, 1), amount: -1000 },
      { date: utcDate(2025, 7, 1), amount: -1000 },
      { date: utcDate(2026, 1, 1), amount: 2150 },
    ];
    const r = xirr(flows)!;
    // Comprobación: el VAN a esa tasa es ~0
    const t0 = flows[0]!.date.getTime();
    const v = flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, (f.date.getTime() - t0) / (365 * 86400000)), 0);
    expect(Math.abs(v)).toBeLessThan(1e-4);
    expect(r).toBeGreaterThan(0.09);
    expect(r).toBeLessThan(0.11);
  });
  it("pérdidas y casos no calculables", () => {
    expect(xirr([{ date: utcDate(2025, 1, 1), amount: -1000 }, { date: utcDate(2026, 1, 1), amount: 800 }])).toBeCloseTo(-0.2, 6);
    expect(xirr([{ date: utcDate(2025, 1, 1), amount: -1000 }])).toBeNull();
    expect(xirr([{ date: utcDate(2025, 1, 1), amount: 1000 }, { date: utcDate(2026, 1, 1), amount: 1000 }])).toBeNull();
  });
  it("flujos de una posición", () => {
    const txs = [buy(utcDate(2025, 1, 1), 100000, "1000", "1")];
    const p = computePosition(txs, [nav(utcDate(2026, 1, 1), "1.1")], "UNITS", utcDate(2026, 1, 1));
    expect(xirr(investmentCashFlows(txs, p)!)).toBeCloseTo(0.1, 6);
  });
});

describe("series mensuales", () => {
  it("valor y aportado acumulado por mes", () => {
    const txs = [buy(utcDate(2026, 1, 1), 30000, "3", "100"), buy(utcDate(2026, 2, 1), 30000, "3", "100")];
    const s = monthlySeries(txs, [nav(utcDate(2026, 1, 31), "101"), nav(utcDate(2026, 2, 28), "102")], "UNITS", utcDate(2026, 3, 10));
    expect(s.map((p) => [p.month, p.value, p.contributedCumulative, p.netContribution])).toEqual([
      ["2026-01", 30300, 30000, 30000],
      ["2026-02", 61200, 60000, 30000],
      ["2026-03", 61200, 60000, 0],
    ]);
  });
});

describe("utilidades", () => {
  it("ISIN con dígito de control", () => {
    expect(isValidIsin("IE00B03HCZ61")).toBe(true);
    expect(isValidIsin("US0378331005")).toBe(true);
    expect(isValidIsin("US0378331006")).toBe(false);
    expect(isValidIsin("XXXXXXXXXXXX")).toBe(false);
  });
  it("completa compras con dos de tres datos y detecta incoherencias", () => {
    expect(completeTrade({ amount: 30000, price: "105.34" })).toEqual({ units: "2.847921", price: "105.34" });
    expect(completeTrade({ amount: 30000, units: "2.847921" }).price).toBe("105.340001");
    expect(() => completeTrade({ amount: 30000, units: "3", price: "105.34" })).toThrow(/no cuadra/);
    expect(() => completeTrade({ amount: 30000 })).toThrow(/participaciones o el precio/);
  });
});
