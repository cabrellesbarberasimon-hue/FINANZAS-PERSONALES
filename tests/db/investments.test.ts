import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedBase } from "../../prisma/seed-lib";
import { utcDate } from "@/domain/dates";
import type { PrismaClient } from "@/server/prisma";
import { createAccount } from "@/server/services/accounts";
import {
  addInvestmentPrice,
  addInvestmentTransaction,
  cashCandidates,
  createInvestment,
  deleteInvestment,
  deleteInvestmentPrice,
  deleteInvestmentTransaction,
  getInvestmentDetail,
  getPortfolio,
} from "@/server/services/investments";
import { netWorthAt } from "@/server/services/networth";
import { createManualTransaction, listTransactions } from "@/server/services/transactions";
import { createTestDb } from "../helpers/test-db";

let db: PrismaClient;
let cleanup: () => Promise<void>;
let userId: string;
let broker: string;
let fundId: string;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  ({ userId } = await seedBase(db));
  broker = (await createAccount(db, userId, { name: "Broker", type: "BROKER", openingBalance: 100000, openingDate: utcDate(2025, 12, 31) })).id;
  fundId = (await createInvestment(db, userId, { name: "Fondo Global Indexado", assetType: "INDEX_FUND", isin: "IE00B03HCZ61", platform: "Broker X", accountId: broker })).id;
});
afterAll(async () => cleanup());

describe("inversiones", () => {
  it("valida el ISIN", async () => {
    await expect(createInvestment(db, userId, { name: "Mal", assetType: "ETF", isin: "US0378331006" })).rejects.toThrow(/ISIN/);
  });

  it("aportación enlazada al cargo del banco: no cuenta como gasto y deja traza", async () => {
    const cash = await createManualTransaction(db, userId, {
      accountId: broker, date: utcDate(2026, 1, 2), amount: -30000, description: "SUSCRIPCION FONDO GLOBAL", kind: "EXPENSE",
    });
    const cands = await cashCandidates(db, userId, { type: "BUY", amount: 30000, fees: 0, date: utcDate(2026, 1, 1) });
    expect(cands.map((c) => c.id)).toEqual([cash.id]);

    const t = await addInvestmentTransaction(db, userId, fundId, { type: "BUY", date: utcDate(2026, 1, 1), amount: 30000, price: "105,34", cashTransactionId: cash.id });
    expect(t.units?.toString()).toBe("2.847921");
    const bank = await db.transaction.findUniqueOrThrow({ where: { id: cash.id }, include: { category: true, subcategory: true } });
    expect(bank.kind).toBe("INVESTMENT");
    expect(bank.subcategory?.name).toBe("Aportación fondo");
    const jan = await listTransactions(db, userId, { month: "2026-01" });
    expect(jan.summary.expenses.total).toBe(0);
    expect(jan.summary.investedNet.total).toBe(30000);

    await expect(
      addInvestmentTransaction(db, userId, fundId, { type: "BUY", date: utcDate(2026, 1, 1), amount: 30000, price: "105.34", cashTransactionId: cash.id }),
    ).rejects.toThrow(/ya está vinculado/);
  });

  it("más aportaciones, histórico de VL y posición", async () => {
    await addInvestmentTransaction(db, userId, fundId, { type: "BUY", date: utcDate(2026, 2, 1), amount: 30000, price: "107.21" });
    await addInvestmentTransaction(db, userId, fundId, { type: "BUY", date: utcDate(2026, 3, 1), amount: 30000, price: "104.82" });
    await addInvestmentPrice(db, userId, fundId, { date: utcDate(2026, 3, 31), price: "110" });
    await expect(addInvestmentPrice(db, userId, fundId, { date: utcDate(2026, 3, 31), price: "111" })).rejects.toThrow(/Ya hay una valoración/);

    const d = await getInvestmentDetail(db, userId, fundId, utcDate(2026, 3, 31));
    expect(d.position?.contributed).toBe(90000);
    expect(d.position?.value).toBe(93590);
    expect(d.position?.totalGain).toBe(3590);
    expect(d.irr).not.toBeNull();
    expect(d.series.map((p) => p.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("no permite vender más participaciones de las que hay", async () => {
    await expect(addInvestmentTransaction(db, userId, fundId, { type: "SELL", date: utcDate(2026, 4, 1), amount: 10000000, units: "999" })).rejects.toThrow(/Venta de 999/);
    expect(await db.investmentTransaction.count({ where: { investmentId: fundId, type: "SELL" } })).toBe(0);
  });

  it("el patrimonio incluye el valor de mercado de la inversión en su fecha", async () => {
    const nw = await netWorthAt(db, userId, utcDate(2026, 3, 31));
    const item = nw.items.find((i) => i.id === fundId)!;
    expect(item).toMatchObject({ value: 93590, group: "INDEX_FUNDS", bucket: "INVESTMENTS" });
    expect(nw.investments).toBe(93590);
    // Antes de la primera aportación no existía: no aparece ni como pendiente.
    const before = await netWorthAt(db, userId, utcDate(2025, 12, 31));
    expect(before.items.find((i) => i.id === fundId)).toBeUndefined();
  });

  it("cartera: totales, desactualizadas y distribución", async () => {
    const p = await getPortfolio(db, userId, utcDate(2026, 9, 24));
    expect(p.contributed).toBe(90000);
    expect(p.value).toBe(93590);
    expect(p.stale.map((r) => r.inv.id)).toEqual([fundId]); // último VL: 31/03
    expect(p.byType).toEqual([{ key: "INDEX_FUND", label: "Fondo indexado", value: 93590 }]);
    expect(p.byPlatform[0]?.label).toBe("Broker X");
  });

  it("borrar la operación desvincula el cargo bancario", async () => {
    const t = await db.investmentTransaction.findFirstOrThrow({ where: { investmentId: fundId, cashTransactionId: { not: null } } });
    await deleteInvestmentTransaction(db, userId, t.id);
    const bank = await db.transaction.findUniqueOrThrow({ where: { id: t.cashTransactionId! } });
    expect(bank.kind).toBe("EXPENSE");
    expect(bank.categoryId).toBeNull();
  });

  it("valor total (PIAS/plan): exige valor total; no se borra con datos", async () => {
    const plan = await createInvestment(db, userId, { name: "Plan pensiones", assetType: "PENSION_PLAN", valuationMode: "TOTAL_VALUE" });
    await addInvestmentTransaction(db, userId, plan.id, { type: "BUY", date: utcDate(2025, 1, 1), amount: 1000000 });
    await expect(addInvestmentPrice(db, userId, plan.id, { date: utcDate(2026, 9, 1), price: "1" })).rejects.toThrow(/valor total/);
    const pr = await addInvestmentPrice(db, userId, plan.id, { date: utcDate(2026, 9, 1), totalValue: 1125000 });
    const d = await getInvestmentDetail(db, userId, plan.id, utcDate(2026, 9, 24));
    expect(d.position).toMatchObject({ contributed: 1000000, value: 1125000, totalGain: 125000, simpleReturn: 12.5 });
    await expect(deleteInvestment(db, userId, plan.id)).rejects.toThrow(/archívala/);
    await deleteInvestmentPrice(db, userId, pr.id);
    const d2 = await getInvestmentDetail(db, userId, plan.id, utcDate(2026, 9, 24));
    expect(d2.position?.value).toBeNull(); // sin valoración: pendiente, nunca el importe aportado
  });
});

import { normalizeDecimalInput } from "@/server/services/investments";
describe("entrada de decimales", () => {
  it("acepta formato español y anglosajón", () => {
    expect(normalizeDecimalInput("1.107,21")).toBe("1107.21");
    expect(normalizeDecimalInput("105,34")).toBe("105.34");
    expect(normalizeDecimalInput("105.34")).toBe("105.34");
    expect(normalizeDecimalInput(" ")).toBeNull();
  });
});
