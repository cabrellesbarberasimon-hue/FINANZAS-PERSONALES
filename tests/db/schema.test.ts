import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedBase } from "../../prisma/seed-lib";
import { SEED_CATEGORIES } from "../../prisma/seed-data/categories";
import { SEED_RULES } from "../../prisma/seed-data/rules";
import { utcDate } from "@/domain/dates";
import { computeDedupHash } from "@/domain/dedup";
import type { PrismaClient } from "@/server/prisma";
import { createTestDb } from "../helpers/test-db";

let db: PrismaClient;
let cleanup: () => Promise<void>;
let userId: string;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  ({ userId } = await seedBase(db));
});
afterAll(async () => cleanup());

async function makeAccount(name: string, type: "CHECKING" | "BROKER" = "CHECKING") {
  return db.account.create({
    data: { userId, name, type, openingBalance: 0, openingDate: utcDate(2026, 1, 1) },
  });
}

function txData(accountId: string, amount: number, description: string, occurrence = 0) {
  const date = utcDate(2026, 3, 1);
  return {
    userId, accountId, date, amount, kind: "EXPENSE" as const,
    descriptionRaw: description, descriptionClean: description,
    dedupHash: computeDedupHash({ accountId, date, amount, description }, occurrence),
    occurrence, source: "MANUAL" as const,
  };
}

describe("seed", () => {
  it("crea todas las categorías, subcategorías y reglas", async () => {
    expect(await db.category.count({ where: { userId } })).toBe(SEED_CATEGORIES.length);
    const subs = SEED_CATEGORIES.reduce((n, c) => n + c.subcategories.length, 0);
    expect(await db.subcategory.count()).toBe(subs);
    expect(await db.categorizationRule.count({ where: { userId } })).toBe(SEED_RULES.length);
  });

  it("es idempotente y no duplica nada", async () => {
    await seedBase(db);
    expect(await db.user.count()).toBe(1);
    expect(await db.category.count({ where: { userId } })).toBe(SEED_CATEGORIES.length);
    expect(await db.categorizationRule.count({ where: { userId } })).toBe(SEED_RULES.length);
  });
});

describe("restricciones de integridad", () => {
  it("la base de datos rechaza un duplicado exacto en la misma cuenta", async () => {
    const acc = await makeAccount("Principal");
    await db.transaction.create({ data: txData(acc.id, -4523, "MERCADONA") });
    await expect(db.transaction.create({ data: txData(acc.id, -4523, "MERCADONA") })).rejects.toThrow();
    // La 2ª operación idéntica legítima (ocurrencia 1) sí entra.
    await db.transaction.create({ data: txData(acc.id, -4523, "MERCADONA", 1) });
    expect(await db.transaction.count({ where: { accountId: acc.id } })).toBe(2);
  });

  it("transferencia interna: relación 1:1 entre ambos movimientos", async () => {
    const bank = await makeAccount("Banco transfer");
    const broker = await makeAccount("Broker transfer", "BROKER");
    const out = await db.transaction.create({ data: { ...txData(bank.id, -50000, "TRASPASO BROKER"), kind: "TRANSFER" } });
    const inn = await db.transaction.create({ data: { ...txData(broker.id, 50000, "TRASPASO DESDE BANCO"), kind: "TRANSFER" } });
    await db.$transaction([
      db.transaction.update({ where: { id: out.id }, data: { transferPeerId: inn.id } }),
      db.transaction.update({ where: { id: inn.id }, data: { transferPeerId: out.id } }),
    ]);
    const loaded = await db.transaction.findUniqueOrThrow({ where: { id: out.id }, include: { transferPeer: true } });
    expect(loaded.transferPeer?.accountId).toBe(broker.id);
    // Un movimiento no puede ser pareja de dos a la vez.
    const other = await db.transaction.create({ data: txData(bank.id, -1, "OTRA") });
    await expect(db.transaction.update({ where: { id: other.id }, data: { transferPeerId: inn.id } })).rejects.toThrow();
  });

  it("el histórico de precios admite un valor por fecha y conserva los anteriores", async () => {
    const inv = await db.investment.create({ data: { userId, name: "Fondo índice global", assetType: "INDEX_FUND" } });
    await db.investmentPrice.create({ data: { investmentId: inv.id, date: utcDate(2026, 1, 1), price: "105.34" } });
    await db.investmentPrice.create({ data: { investmentId: inv.id, date: utcDate(2026, 2, 1), price: "107.21" } });
    await expect(
      db.investmentPrice.create({ data: { investmentId: inv.id, date: utcDate(2026, 2, 1), price: "1" } }),
    ).rejects.toThrow();
    const prices = await db.investmentPrice.findMany({ where: { investmentId: inv.id }, orderBy: { date: "asc" } });
    expect(prices.map((p) => p.price?.toString())).toEqual(["105.34", "107.21"]);
  });

  it("las participaciones se guardan con precisión decimal exacta", async () => {
    const inv = await db.investment.create({ data: { userId, name: "Fondo precisión", assetType: "INDEX_FUND" } });
    const tx = await db.investmentTransaction.create({
      data: { investmentId: inv.id, date: utcDate(2026, 1, 1), type: "BUY", units: "2.847958", price: "105.34", amount: 30000 },
    });
    expect(tx.units?.toString()).toBe("2.847958");
  });

  it("borrar una cuenta elimina sus movimientos (sin huérfanos)", async () => {
    const acc = await makeAccount("Temporal");
    await db.transaction.create({ data: txData(acc.id, -100, "X") });
    await db.account.delete({ where: { id: acc.id } });
    expect(await db.transaction.count({ where: { accountId: acc.id } })).toBe(0);
  });
});
