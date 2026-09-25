import { describe, expect, it } from "vitest";
import { compareNetWorth, computeNetWorth, type AssetItem } from "@/domain/networth";

const acc = (id: string, value: number | null, over: Partial<AssetItem> = {}): AssetItem => ({
  id, name: id, kind: "account", group: "BANK", bucket: "LIQUIDITY", currency: "EUR", value, ...over,
});

describe("patrimonio neto", () => {
  it("activos − pasivos, con liquidez, inversión y otros activos por separado", () => {
    const nw = computeNetWorth(
      [
        acc("corriente", 345000),
        acc("ahorro", 820000),
        acc("efectivo", 15000, { group: "CASH" }),
        acc("broker-manual", 1250000, { group: "INVESTMENT_OTHER", bucket: "INVESTMENTS" }),
        acc("coche", 1100000, { group: "OTHER_ASSETS", bucket: "OTHER_ASSETS" }),
      ],
      [{ id: "prestamo", name: "Préstamo", value: 500000 }],
    );
    expect(nw.assets).toBe(3530000);
    expect(nw.liabilities).toBe(500000);
    expect(nw.netWorth).toBe(3030000);
    expect(nw.liquidity).toBe(1180000);
    expect(nw.investments).toBe(1250000);
    expect(nw.otherAssets).toBe(1100000);
    expect(nw.complete).toBe(true);
    expect(nw.distribution.map((d) => d.group)).toEqual(["INVESTMENT_OTHER", "BANK", "OTHER_ASSETS", "CASH"]);
    expect(nw.distribution.reduce((s, d) => s + (d.share ?? 0), 0)).toBeCloseTo(100, 10);
  });

  it("ejemplo del enunciado: activos 40.000 €, deudas 5.000 € -> 35.000 €", () => {
    const nw = computeNetWorth([acc("a", 4000000)], [{ id: "d", name: "Deuda", value: 500000 }]);
    expect(nw.netWorth).toBe(3500000);
  });

  it("una tarjeta con saldo negativo cuenta como deuda", () => {
    const nw = computeNetWorth([acc("c", 100000), acc("tarjeta", -70367)], []);
    expect(nw).toMatchObject({ assets: 100000, liabilities: 70367, netWorth: 29633 });
  });

  it("sin valor u otra moneda: se excluye, se lista como pendiente y el total es INCOMPLETO", () => {
    const nw = computeNetWorth(
      [acc("a", 100000), acc("b", null, { pendingReason: "Sin saldo" }), acc("usd", 5000, { currency: "USD" })],
      [{ id: "d", name: "Deuda", value: null }],
    );
    expect(nw.netWorth).toBe(100000);
    expect(nw.complete).toBe(false);
    expect(nw.pending.map((p) => p.id)).toEqual(["b", "usd", "d"]);
  });

  it("la variación no se calcula si alguna foto está incompleta", () => {
    const now = computeNetWorth([acc("a", 110000)], []);
    const before = computeNetWorth([acc("a", 100000)], []);
    expect(compareNetWorth(now, before)).toEqual({ delta: 10000, pct: 10 });
    const incomplete = computeNetWorth([acc("a", null)], []);
    expect(compareNetWorth(now, incomplete).delta).toBeNull();
    expect(compareNetWorth(now, null).delta).toBeNull();
  });
});
