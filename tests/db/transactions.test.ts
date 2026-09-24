import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedBase } from "../../prisma/seed-lib";
import { utcDate } from "@/domain/dates";
import type { PrismaClient } from "@/server/prisma";
import { createAccount } from "@/server/services/accounts";
import {
  createManualTransaction,
  deleteTransaction,
  getTransferCandidates,
  linkTransfer,
  listTransactions,
  unlinkTransfer,
  updateTransaction,
} from "@/server/services/transactions";
import { createTestDb } from "../helpers/test-db";

let db: PrismaClient;
let cleanup: () => Promise<void>;
let userId: string;
let bank: string;
let broker: string;
let superCat: { categoryId: string; subcategoryId: string };

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  ({ userId } = await seedBase(db));
  const opening = { openingBalance: 0, openingDate: utcDate(2026, 1, 1) };
  bank = (await createAccount(db, userId, { name: "Banco", type: "CHECKING", ...opening })).id;
  broker = (await createAccount(db, userId, { name: "Broker", type: "BROKER", ...opening })).id;
  const cat = await db.category.findFirstOrThrow({ where: { userId, name: "Alimentación" }, include: { subcategories: true } });
  superCat = { categoryId: cat.id, subcategoryId: cat.subcategories.find((s) => s.name === "Supermercado")!.id };
});
afterAll(async () => cleanup());

const tx = (over: Record<string, unknown> = {}) => ({
  accountId: bank,
  date: utcDate(2026, 3, 2),
  amount: -4523,
  description: "MERCADONA VALENCIA",
  ...over,
});

describe("alta manual", () => {
  it("el tipo lo fija la categoría", async () => {
    const t = await createManualTransaction(db, userId, tx({ ...superCat, kind: "INCOME" }));
    expect(t.kind).toBe("EXPENSE");
    expect(t.categorizationSource).toBe("MANUAL");
  });

  it("un duplicado exacto exige confirmación explícita y luego usa otra ocurrencia", async () => {
    await expect(createManualTransaction(db, userId, tx())).rejects.toThrow("idéntico");
    const t = await createManualTransaction(db, userId, tx(), { allowDuplicate: true });
    expect(t.occurrence).toBe(1);
  });

  it("rechaza ingresos negativos e importes 0", async () => {
    await expect(createManualTransaction(db, userId, tx({ kind: "INCOME", description: "A" }))).rejects.toThrow("ingreso");
    await expect(createManualTransaction(db, userId, tx({ amount: 0, description: "B" }))).rejects.toThrow("0");
  });
});

describe("edición", () => {
  it("corregir la categoría registra la corrección para el aprendizaje y la auditoría", async () => {
    const t = await createManualTransaction(db, userId, tx({ description: "COMPRA TARJ. 1234XXXX5678 MERCADONA ALZIRA", date: utcDate(2026, 3, 5) }));
    await updateTransaction(db, userId, t.id, { descriptionClean: "MERCADONA ALZIRA", ...superCat });
    const corr = await db.categorizationCorrection.findMany({ where: { transactionId: t.id } });
    expect(corr).toHaveLength(1);
    expect(corr[0]!.merchantKey).toBe("MERCADONA ALZIRA");
    const audit = await db.auditLog.findMany({ where: { entityId: t.id } });
    expect(audit.map((a) => a.action).sort()).toEqual(["create", "update"]);
  });

  it("los datos bancarios de un movimiento importado no se pueden alterar", async () => {
    const t = await createManualTransaction(db, userId, tx({ description: "IMPORTADO", date: utcDate(2026, 3, 6) }));
    await db.transaction.update({ where: { id: t.id }, data: { source: "IMPORT" } });
    await expect(
      updateTransaction(db, userId, t.id, { descriptionClean: "IMPORTADO", amount: -1 }),
    ).rejects.toThrow("extracto");
    // Pero sí su categoría, notas, etc.
    const u = await updateTransaction(db, userId, t.id, { descriptionClean: "IMPORTADO", notes: "nota", ...superCat });
    expect(u.notes).toBe("nota");
  });

  it("editar importe de un manual recalcula el hash", async () => {
    const t = await createManualTransaction(db, userId, tx({ description: "EDITABLE", date: utcDate(2026, 3, 7) }));
    const u = await updateTransaction(db, userId, t.id, { descriptionClean: "EDITABLE", amount: -5000 });
    expect(u.amount).toBe(-5000);
    expect(u.dedupHash).not.toBe(t.dedupHash);
  });
});

describe("transferencias internas", () => {
  it("-500 € banco / +500 € broker: se vinculan, se excluyen de ingresos/gastos y se pueden desvincular", async () => {
    const out = await createManualTransaction(db, userId, tx({ amount: -50000, description: "TRASPASO A BROKER", date: utcDate(2026, 4, 1) }));
    const inn = await createManualTransaction(db, userId, tx({ accountId: broker, amount: 50000, description: "TRASPASO DESDE BANCO", date: utcDate(2026, 4, 2), kind: "INCOME" }));

    const candidates = await getTransferCandidates(db, userId, out.id);
    expect(candidates.map((c) => c.id)).toEqual([inn.id]);

    await linkTransfer(db, userId, out.id, inn.id);
    const [a, b] = await Promise.all([
      db.transaction.findUniqueOrThrow({ where: { id: out.id }, include: { category: true } }),
      db.transaction.findUniqueOrThrow({ where: { id: inn.id } }),
    ]);
    expect(a.kind).toBe("TRANSFER");
    expect(b.kind).toBe("TRANSFER");
    expect(a.transferPeerId).toBe(inn.id);
    expect(b.transferPeerId).toBe(out.id);
    expect(a.category?.name).toBe("Transferencias");

    const april = await listTransactions(db, userId, { month: "2026-04" });
    expect(april.summary.income.total).toBe(0);
    expect(april.summary.expenses.total).toBe(0);
    expect(april.summary.excluded.transactionIds.sort()).toEqual([out.id, inn.id].sort());

    // No se puede recategorizar sin desvincular.
    await expect(updateTransaction(db, userId, out.id, { descriptionClean: "X", ...superCat })).rejects.toThrow("desvincúlala");

    await unlinkTransfer(db, userId, out.id);
    const b2 = await db.transaction.findUniqueOrThrow({ where: { id: inn.id } });
    expect(b2.transferPeerId).toBeNull();
    expect(b2.kind).toBe("INCOME");
  });

  it("borrar un lado de una transferencia desvincula el otro", async () => {
    const out = await createManualTransaction(db, userId, tx({ amount: -1000, description: "T1", date: utcDate(2026, 5, 1) }));
    const inn = await createManualTransaction(db, userId, tx({ accountId: broker, amount: 1000, description: "T2", date: utcDate(2026, 5, 1), kind: "INCOME" }));
    await linkTransfer(db, userId, out.id, inn.id);
    await deleteTransaction(db, userId, out.id);
    const b = await db.transaction.findUniqueOrThrow({ where: { id: inn.id } });
    expect(b.transferPeerId).toBeNull();
    expect(b.kind).toBe("INCOME");
  });
});

describe("filtros", () => {
  it("por mes, cuenta, categoría, importe absoluto y texto", async () => {
    const march = await listTransactions(db, userId, { month: "2026-03" });
    expect(march.total).toBeGreaterThan(0);
    expect(march.rows.every((r) => r.date.getUTCMonth() === 2)).toBe(true);

    const byAmount = await listTransactions(db, userId, { minAmount: 49000, maxAmount: 51000 });
    expect(byAmount.rows.every((r) => Math.abs(r.amount) >= 49000 && Math.abs(r.amount) <= 51000)).toBe(true);

    const text = await listTransactions(db, userId, { q: "alzira" });
    expect(text.rows.map((r) => r.descriptionClean)).toEqual(["MERCADONA ALZIRA"]);

    const uncategorized = await listTransactions(db, userId, { categoryId: "none" });
    expect(uncategorized.rows.every((r) => r.categoryId === null)).toBe(true);

    const broker2 = await listTransactions(db, userId, { accountId: broker });
    expect(broker2.rows.every((r) => r.accountId === broker)).toBe(true);
  });
});
