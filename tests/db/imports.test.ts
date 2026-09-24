import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedBase } from "../../prisma/seed-lib";
import { utcDate } from "@/domain/dates";
import type { PrismaClient } from "@/server/prisma";
import { createAccount, getAccountDetail } from "@/server/services/accounts";
import {
  buildPreview,
  commitImport,
  createImportFromUpload,
  discardPreview,
  getMappingStep,
  revertImport,
  saveImportConfig,
} from "@/server/services/imports";
import { createManualTransaction } from "@/server/services/transactions";
import { createTestDb } from "../helpers/test-db";

const TODAY = utcDate(2026, 9, 24);
const bancoA = new Uint8Array(readFileSync(path.resolve(__dirname, "../fixtures/banco-a-latin1.csv")));

let db: PrismaClient;
let cleanup: () => Promise<void>;
let userId: string;
let n = 0;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  ({ userId } = await seedBase(db));
});
afterAll(async () => cleanup());

async function account(opening = { balance: 100000, date: utcDate(2026, 8, 31) }) {
  return createAccount(db, userId, {
    name: `Cuenta ${++n}`,
    type: "CHECKING",
    openingBalance: opening.balance,
    openingDate: opening.date,
  });
}

/** Sube, confirma el mapeo sugerido y devuelve el id de la importación. */
async function upload(accountId: string, bytes = bancoA, fileName = "extracto.csv") {
  const { imp, previous } = await createImportFromUpload(db, userId, { accountId, fileName, bytes });
  const { config } = await getMappingStep(db, userId, imp.id);
  await saveImportConfig(db, userId, imp.id, config);
  return { id: imp.id, previous };
}

const commit = (id: string, opts: Partial<Parameters<typeof commitImport>[3]> = {}) =>
  commitImport(db, userId, id, { excludeRows: [], adjustOpening: false, ...opts }, TODAY);

describe("importación completa", () => {
  it("vista previa: detectadas, nuevas, categorías por reglas y conciliación prevista", async () => {
    const acc = await account();
    const { id } = await upload(acc.id);
    const p = await buildPreview(db, userId, id, TODAY);
    expect(p.counts).toEqual({ detected: 7, new: 6, duplicate: 0, probable: 0, invalid: 1 });
    const label = (d: string) => p.rows.find((r) => r.description.includes(d))?.categoryLabel;
    expect(label("NETFLIX")).toBe("Ocio / Suscripciones");
    expect(label("MERCADONA")).toBe("Alimentación / Supermercado");
    expect(label("NÓMINA")).toBe("Ingresos / Nómina");
    expect(p.rows.find((r) => r.description.includes("NÓMINA"))?.kind).toBe("INCOME");
    expect(p.reconciliation).toMatchObject({ statement: 308878, computedAfter: 308878, difference: 0 });
  });

  it("confirmar: guarda con trazabilidad y el saldo cuadra con el banco", async () => {
    const acc = await account();
    const { id } = await upload(acc.id);
    const r = await commit(id);
    expect(r).toEqual({ inserted: 6, flagged: 0, duplicate: 0, skipped: 1, balanceDifference: 0 });
    const txs = await db.transaction.findMany({ where: { importId: id } });
    expect(txs.every((t) => t.source === "IMPORT" && t.importRowIndex !== null)).toBe(true);
    const detail = await getAccountDetail(db, userId, acc.id);
    expect(detail.balance).toBe(308878);
    expect(detail.reconciliation[0]).toMatchObject({ declared: 308878, difference: 0 });
    const imp = await db.import.findUniqueOrThrow({ where: { id } });
    expect(imp).toMatchObject({ status: "COMMITTED", rowsNew: 6, rowsDuplicate: 0, rowsSkipped: 1, rowsTotal: 7 });
    const rule = await db.categorizationRule.findFirstOrThrow({ where: { userId, pattern: "NETFLIX" } });
    expect(rule.timesApplied).toBeGreaterThan(0);
  });

  it("importar dos veces el mismo extracto NO duplica: aviso de fichero repetido y 0 nuevas", async () => {
    const acc = await account();
    await commit((await upload(acc.id)).id);
    const second = await upload(acc.id);
    expect(second.previous).not.toBeNull();
    const p = await buildPreview(db, userId, second.id, TODAY);
    expect(p.counts).toMatchObject({ new: 0, duplicate: 6 });
    const r = await commit(second.id);
    expect(r.inserted).toBe(0);
    expect(r.duplicate).toBe(6);
    expect(await db.transaction.count({ where: { accountId: acc.id } })).toBe(6);
  });

  it("extracto solapado: solo entran las operaciones nuevas", async () => {
    const acc = await account();
    await commit((await upload(acc.id)).id);
    const csv =
      "Fecha operación;Concepto;Importe;Saldo\n10/09/2026;REPSOL E.S. 1234;-50,00;3.038,78\n06/09/2026;TRANSFERENCIA A CUENTA AHORRO;-300,00;3.088,78\n05/09/2026;RECIBO NETFLIX.COM;-12,99;3.388,78\n";
    const { id } = await upload(acc.id, new TextEncoder().encode(csv), "septiembre-2.csv");
    const r = await commit(id);
    expect(r).toMatchObject({ inserted: 1, duplicate: 2, balanceDifference: 0 });
  });

  it("duplicado probable: se importa marcado para revisión, nunca en silencio", async () => {
    const acc = await account();
    await createManualTransaction(db, userId, {
      accountId: acc.id, date: utcDate(2026, 9, 4), amount: -4523, description: "MERCADONA VALENCIA", kind: "EXPENSE",
    });
    const { id } = await upload(acc.id);
    const p = await buildPreview(db, userId, id, TODAY);
    expect(p.counts.probable).toBe(1);
    const r = await commit(id);
    expect(r.flagged).toBe(1);
    const flags = await db.reviewFlag.findMany({ where: { importId: id, type: "POSSIBLE_DUPLICATE" } });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.relatedTransactionId).not.toBeNull();
    // El duplicado real descuadra el saldo en 45,23 € y queda señalado.
    expect(r.balanceDifference).toBe(4523);
    expect(await db.reviewFlag.count({ where: { importId: id, type: "BALANCE_MISMATCH" } })).toBe(1);
  });

  it("el usuario puede excluir filas", async () => {
    const acc = await account();
    const { id } = await upload(acc.id);
    const p = await buildPreview(db, userId, id, TODAY);
    const cafe = p.rows.filter((r) => r.description === "CAFE BAR PEPE").map((r) => r.rowIndex);
    const r = await commit(id, { excludeRows: cafe });
    expect(r).toMatchObject({ inserted: 4, skipped: 3 });
  });

  it("deshacer: elimina sus movimientos y saldos; se puede volver a importar", async () => {
    const acc = await account();
    const { id } = await upload(acc.id);
    await commit(id);
    expect(await revertImport(db, userId, id)).toEqual({ deleted: 6 });
    expect(await db.transaction.count({ where: { accountId: acc.id } })).toBe(0);
    expect(await db.accountBalance.count({ where: { importId: id } })).toBe(0);
    expect((await db.import.findUniqueOrThrow({ where: { id } })).status).toBe("REVERTED");
    const again = await commit((await upload(acc.id)).id);
    expect(again.inserted).toBe(6);
  });

  it("ajustar saldo inicial desde el extracto (cuenta creada hoy con el saldo actual) y restaurarlo al deshacer", async () => {
    const acc = await account({ balance: 308878, date: TODAY });
    const { id } = await upload(acc.id);
    const p = await buildPreview(db, userId, id, TODAY);
    expect(p.openingSuggestion).toMatchObject({ date: utcDate(2026, 8, 31), balance: 100000 });
    await commit(id, { adjustOpening: true });
    const detail = await getAccountDetail(db, userId, acc.id);
    expect(detail.account.openingDate).toEqual(utcDate(2026, 8, 31));
    expect(detail.balance).toBe(308878);
    await revertImport(db, userId, id);
    const restored = await db.account.findUniqueOrThrow({ where: { id: acc.id } });
    expect(restored.openingDate).toEqual(TODAY);
    expect(restored.openingBalance).toBe(308878);
  });

  it("perfil de banco: se guarda y se reutiliza automáticamente", async () => {
    const acc = await account();
    const { id } = await upload(acc.id);
    await commit(id, { saveProfileName: "Banco A" });
    const { imp } = await createImportFromUpload(db, userId, { accountId: acc.id, fileName: "otro.csv", bytes: bancoA });
    expect(imp.profileId).not.toBeNull();
  });

  it("mapeo incompleto: error claro; descartar una vista previa", async () => {
    const acc = await account();
    const { imp } = await createImportFromUpload(db, userId, { accountId: acc.id, fileName: "x.csv", bytes: bancoA });
    const { config } = await getMappingStep(db, userId, imp.id);
    await expect(
      saveImportConfig(db, userId, imp.id, { ...config, columns: { ...config.columns, date: null } }),
    ).rejects.toThrow(/fecha/);
    await expect(commit(imp.id)).rejects.toThrow(/mapeo/);
    await discardPreview(db, userId, imp.id);
    expect(await db.import.findUnique({ where: { id: imp.id } })).toBeNull();
  });

  it("no se importa en cuentas valoradas manualmente", async () => {
    const acc = await createAccount(db, userId, { name: "Casa", type: "OTHER", openingBalance: 1, openingDate: TODAY });
    await expect(createImportFromUpload(db, userId, { accountId: acc.id, fileName: "x.csv", bytes: bancoA })).rejects.toThrow(/manuales/);
  });
});
