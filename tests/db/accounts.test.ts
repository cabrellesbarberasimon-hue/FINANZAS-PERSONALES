import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedBase } from "../../prisma/seed-lib";
import { computeBalance } from "@/domain/accounts";
import { utcDate } from "@/domain/dates";
import type { PrismaClient } from "@/server/prisma";
import {
  addDeclaredBalance,
  createAccount,
  deleteAccount,
  getAccountDetail,
  listAccounts,
  updateAccount,
} from "@/server/services/accounts";
import { createManualTransaction } from "@/server/services/transactions";
import { addLiabilityBalance, createLiability, listLiabilities } from "@/server/services/liabilities";
import { createTestDb } from "../helpers/test-db";

let db: PrismaClient;
let cleanup: () => Promise<void>;
let userId: string;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  ({ userId } = await seedBase(db));
});
afterAll(async () => cleanup());

const base = { type: "CHECKING" as const, openingBalance: 100000, openingDate: utcDate(2026, 1, 31) };

describe("cuentas", () => {
  it("valida campos y rechaza nombres repetidos", async () => {
    await expect(createAccount(db, userId, { ...base, name: "  " })).rejects.toThrow("Revisa");
    await createAccount(db, userId, { ...base, name: "Principal" });
    await expect(createAccount(db, userId, { ...base, name: "Principal" })).rejects.toThrow("nombre");
  });

  it("saldo calculado = saldo inicial + movimientos; coincide con el cálculo de dominio", async () => {
    const acc = await createAccount(db, userId, { ...base, name: "Saldo" });
    const mk = (d: Date, amount: number, description: string) =>
      createManualTransaction(db, userId, { accountId: acc.id, date: d, amount, description, kind: amount > 0 ? "INCOME" : "EXPENSE" });
    await mk(utcDate(2026, 1, 15), -999, "ANTERIOR AL SALDO INICIAL");
    await mk(utcDate(2026, 2, 1), 250000, "NOMINA");
    await mk(utcDate(2026, 2, 3), -4523, "MERCADONA");

    const [summary] = (await listAccounts(db, userId)).filter((s) => s.account.id === acc.id);
    const detail = await getAccountDetail(db, userId, acc.id);
    const txs = await db.transaction.findMany({ where: { accountId: acc.id } });
    const domain = computeBalance({ balance: acc.openingBalance, date: acc.openingDate }, txs);

    expect(summary!.balance).toBe(100000 + 250000 - 4523);
    expect(detail.balance).toBe(summary!.balance);
    expect(domain.balance).toBe(summary!.balance);
    expect(detail.ignoredBeforeOpening).toBe(1);
  });

  it("conciliación: el saldo declarado muestra la diferencia con el calculado", async () => {
    const acc = await createAccount(db, userId, { ...base, name: "Concilia" });
    await createManualTransaction(db, userId, { accountId: acc.id, date: utcDate(2026, 2, 5), amount: -2000, description: "X", kind: "EXPENSE" });
    await addDeclaredBalance(db, userId, acc.id, { date: utcDate(2026, 2, 5), balance: 113000 }); // banco: 1.130 €
    const [summary] = (await listAccounts(db, userId)).filter((s) => s.account.id === acc.id);
    expect(summary!.lastDifference).toBe(113000 - 98000);
    const detail = await getAccountDetail(db, userId, acc.id);
    expect(detail.reconciliation[0]).toMatchObject({ declared: 113000, computed: 98000, difference: 15000 });
    // Un segundo saldo manual en la misma fecha no sobrescribe el primero.
    await expect(addDeclaredBalance(db, userId, acc.id, { date: utcDate(2026, 2, 5), balance: 1 })).rejects.toThrow("Ya hay");
  });

  it("otros activos: el valor es la última valoración declarada", async () => {
    const acc = await createAccount(db, userId, { ...base, type: "OTHER", name: "Coche", openingBalance: 1200000 });
    await addDeclaredBalance(db, userId, acc.id, { date: utcDate(2026, 6, 30), balance: 1100000 });
    const [s] = (await listAccounts(db, userId)).filter((x) => x.account.id === acc.id);
    expect(s!.balance).toBe(1100000);
  });

  it("editar deja registro de auditoría con el antes y el después", async () => {
    const acc = await createAccount(db, userId, { ...base, name: "Auditada" });
    await updateAccount(db, userId, acc.id, { ...base, name: "Auditada 2", openingBalance: 5 });
    const logs = await db.auditLog.findMany({ where: { entityId: acc.id }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(["create", "update"]);
    expect(JSON.parse(logs[1]!.before!).openingBalance).toBe(100000);
    expect(JSON.parse(logs[1]!.after!).openingBalance).toBe(5);
  });

  it("no se puede borrar una cuenta con movimientos (hay que archivarla)", async () => {
    const acc = await createAccount(db, userId, { ...base, name: "Con movimientos" });
    await createManualTransaction(db, userId, { accountId: acc.id, date: utcDate(2026, 2, 5), amount: -100, description: "X", kind: "EXPENSE" });
    await expect(deleteAccount(db, userId, acc.id)).rejects.toThrow("archívala");
    const empty = await createAccount(db, userId, { ...base, name: "Vacía" });
    await deleteAccount(db, userId, empty.id);
    expect(await db.account.findUnique({ where: { id: empty.id } })).toBeNull();
  });

  it("no se accede a cuentas de otro usuario", async () => {
    const other = await db.user.create({ data: { name: "Otro" } });
    const acc = await createAccount(db, other.id, { ...base, name: "Ajena" });
    await expect(getAccountDetail(db, userId, acc.id)).rejects.toThrow("no existe");
  });
});

describe("pasivos", () => {
  it("histórico de deuda pendiente; sin saldo es 'pendiente de datos'", async () => {
    const l = await createLiability(db, userId, { name: "Préstamo coche", type: "LOAN" });
    expect((await listLiabilities(db, userId))[0]!.current).toBeNull();
    await addLiabilityBalance(db, userId, l.id, { date: utcDate(2026, 1, 31), balance: 800000 });
    await addLiabilityBalance(db, userId, l.id, { date: utcDate(2026, 2, 28), balance: 780000 });
    const [row] = await listLiabilities(db, userId);
    expect(row!.current?.balance).toBe(780000);
    expect(await db.liabilityBalance.count({ where: { liabilityId: l.id } })).toBe(2);
  });
});
