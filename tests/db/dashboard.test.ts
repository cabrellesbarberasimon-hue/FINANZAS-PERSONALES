import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedBase } from "../../prisma/seed-lib";
import { utcDate } from "@/domain/dates";
import type { PrismaClient } from "@/server/prisma";
import { addDeclaredBalance, createAccount } from "@/server/services/accounts";
import { getDashboard } from "@/server/services/dashboard";
import { addLiabilityBalance, createLiability } from "@/server/services/liabilities";
import { netWorthAt } from "@/server/services/networth";
import { createManualTransaction } from "@/server/services/transactions";
import { createTestDb } from "../helpers/test-db";

let db: PrismaClient;
let cleanup: () => Promise<void>;
let userId: string;
let bank: string;

const TODAY = utcDate(2026, 9, 24);

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  ({ userId } = await seedBase(db));
  bank = (await createAccount(db, userId, { name: "Banco", type: "CHECKING", openingBalance: 100000, openingDate: utcDate(2025, 8, 31) })).id;
  const tx = (d: Date, amount: number, description: string, kind: "INCOME" | "EXPENSE") =>
    createManualTransaction(db, userId, { accountId: bank, date: d, amount, description, kind });
  await tx(utcDate(2026, 8, 1), 250000, "NOMINA AGOSTO", "INCOME");
  await tx(utcDate(2026, 8, 5), -80000, "ALQUILER AGOSTO", "EXPENSE");
  await tx(utcDate(2026, 9, 1), 250000, "NOMINA SEPT", "INCOME");
  await tx(utcDate(2026, 9, 2), -80000, "ALQUILER SEPT", "EXPENSE");
  await tx(utcDate(2026, 9, 3), -4523, "MERCADONA", "EXPENSE");
  await tx(utcDate(2026, 9, 25), -99999, "FUTURO", "EXPENSE"); // posterior a hoy: no cuenta
  const casa = await createAccount(db, userId, { name: "Coche", type: "OTHER", openingBalance: 1200000, openingDate: utcDate(2025, 1, 1) });
  await addDeclaredBalance(db, userId, casa.id, { date: utcDate(2026, 6, 30), balance: 1100000 });
  const loan = await createLiability(db, userId, { name: "Préstamo", type: "LOAN", startDate: utcDate(2025, 1, 1) });
  await addLiabilityBalance(db, userId, loan.id, { date: utcDate(2025, 1, 1), balance: 600000 });
  await addLiabilityBalance(db, userId, loan.id, { date: utcDate(2026, 9, 1), balance: 500000 });
});
afterAll(async () => cleanup());

describe("patrimonio a una fecha", () => {
  it("hoy: cuentas + otros activos − deudas", async () => {
    const nw = await netWorthAt(db, userId, TODAY);
    // Banco: 1.000 + 2.500 − 800 + 2.500 − 800 − 45,23 = 4.354,77
    expect(nw.liquidity).toBe(435477);
    expect(nw.otherAssets).toBe(1100000);
    expect(nw.liabilities).toBe(500000);
    expect(nw.netWorth).toBe(435477 + 1100000 - 500000);
    expect(nw.complete).toBe(true);
  });

  it("a fin de agosto usa los saldos de esa fecha", async () => {
    const nw = await netWorthAt(db, userId, utcDate(2026, 8, 31));
    expect(nw.liquidity).toBe(270000);
    expect(nw.liabilities).toBe(600000);
  });

  it("antes del saldo inicial de una cuenta: pendiente de datos, nunca 0", async () => {
    const nw = await netWorthAt(db, userId, utcDate(2025, 6, 30));
    expect(nw.complete).toBe(false);
    expect(nw.pending.map((p) => p.name)).toContain("Banco");
  });
});

describe("dashboard", () => {
  it("KPIs del mes y variaciones", async () => {
    const d = await getDashboard(db, userId, "2026-09", TODAY);
    expect(d.isCurrentMonth).toBe(true);
    expect(d.cashflow.income.total).toBe(250000);
    // El gasto futuro (25/09) está en el mes pero se incluye: pertenece a septiembre.
    expect(d.cashflow.expenses.total).toBe(80000 + 4523 + 99999);
    expect(d.changeMonth.delta).toBe(d.netWorth.netWorth - d.previousMonthEnd.netWorth);
    // Hace un año (24/09/2025): banco 1.000 + coche 12.000 − préstamo 6.000 = 7.000 €.
    expect(d.yearAgo.netWorth).toBe(700000);
    expect(d.changeYear.delta).toBe(335477);
    expect(d.topExpenses[0]).toMatchObject({ name: "Sin categoría" });
  });

  it("si hace un año faltan datos, la variación anual queda pendiente", async () => {
    const d = await getDashboard(db, userId, "2026-08", TODAY); // hace un año: 31/08/2025 = saldo inicial
    expect(d.yearAgo.complete).toBe(true);
    const older = await getDashboard(db, userId, "2026-07", TODAY); // 31/07/2025: sin datos del banco
    expect(older.changeYear.delta).toBeNull();
    expect(older.changeYear.reason).toMatch(/Faltan datos/);
  });

  it("mes pasado: patrimonio a fin de mes", async () => {
    const d = await getDashboard(db, userId, "2026-08", TODAY);
    expect(d.isCurrentMonth).toBe(false);
    expect(d.date).toEqual(utcDate(2026, 8, 31));
    expect(d.cashflow.savings).toBe(170000);
    expect(d.cashflow.savingsRate).toBeCloseTo(68, 10);
  });
});
