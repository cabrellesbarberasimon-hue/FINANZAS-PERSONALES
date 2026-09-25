import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedBase } from "../../prisma/seed-lib";
import { utcDate } from "@/domain/dates";
import type { PrismaClient } from "@/server/prisma";
import { createAccount } from "@/server/services/accounts";
import {
  createCategory,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
  setCategoryArchived,
} from "@/server/services/categories";
import { commitImport, createImportFromUpload, getMappingStep, saveImportConfig } from "@/server/services/imports";
import { confirmDuplicate, getReviewSummary, listOpenFlags, resolveFlag } from "@/server/services/review";
import {
  acceptSuggestion,
  applyRules,
  createRule,
  deleteRule,
  dismissSuggestion,
  getRuleSuggestions,
  previewRule,
  updateRule,
} from "@/server/services/rules";
import { createManualTransaction, linkTransfer, updateTransaction } from "@/server/services/transactions";
import { detectTransfers } from "@/server/services/transfer-detection";
import { createTestDb } from "../helpers/test-db";

let db: PrismaClient;
let cleanup: () => Promise<void>;
let userId: string;
let bank: string;
let savings: string;
let ids: { ocio: string; subs: string; alim: string; restaurantes: string };

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  ({ userId } = await seedBase(db));
  const opening = { openingBalance: 0, openingDate: utcDate(2026, 1, 1) };
  bank = (await createAccount(db, userId, { name: "Banco", type: "CHECKING", ...opening })).id;
  savings = (await createAccount(db, userId, { name: "Ahorro", type: "SAVINGS", ...opening })).id;
  const cats = await db.category.findMany({ where: { userId }, include: { subcategories: true } });
  const ocio = cats.find((c) => c.name === "Ocio")!;
  const alim = cats.find((c) => c.name === "Alimentación")!;
  ids = {
    ocio: ocio.id,
    subs: ocio.subcategories.find((s) => s.name === "Suscripciones")!.id,
    alim: alim.id,
    restaurantes: alim.subcategories.find((s) => s.name === "Restaurantes")!.id,
  };
});
afterAll(async () => cleanup());

let day = 1;
const expense = (description: string, amount = -1200, accountId = bank) =>
  createManualTransaction(db, userId, { accountId, date: utcDate(2026, 4, day++ % 28 + 1), amount, description, kind: "EXPENSE" });

describe("reglas", () => {
  it("vista previa: cuántos movimientos coincidirían", async () => {
    await expense("PADEL CLUB NORTE 01");
    await expense("PADEL CLUB NORTE 02");
    const p = await previewRule(db, userId, { pattern: "PADEL CLUB", categoryId: ids.ocio });
    expect(p).toMatchObject({ total: 2, uncategorized: 2, manual: 0 });
  });

  it("valida el patrón y las referencias", async () => {
    await expect(createRule(db, userId, { pattern: "(", matchType: "REGEX", categoryId: ids.ocio })).rejects.toThrow(/Patrón/);
    await expect(createRule(db, userId, { pattern: "X", categoryId: "no-existe" })).rejects.toThrow(/categoría/);
  });

  it("aplicar reglas: categoriza los sin categoría y nunca toca los manuales", async () => {
    const manual = await expense("PADEL CLUB NORTE 03");
    await updateTransaction(db, userId, manual.id, { descriptionClean: "PADEL", categoryId: ids.alim, subcategoryId: ids.restaurantes });
    const rule = await createRule(db, userId, { pattern: "PADEL CLUB", categoryId: ids.ocio, subcategoryId: ids.subs });
    const r = await applyRules(db, userId, "uncategorized");
    expect(r.changed).toBe(2);
    const padel = await db.transaction.findMany({ where: { descriptionRaw: { startsWith: "PADEL" } }, orderBy: { descriptionRaw: "asc" } });
    expect(padel.map((t) => t.categorizationSource)).toEqual(["RULE", "RULE", "MANUAL"]);
    expect(padel[2]!.categoryId).toBe(ids.alim);
    expect((await db.categorizationRule.findUniqueOrThrow({ where: { id: rule.id } })).timesApplied).toBe(2);

    // Editar la regla y recalcular los automáticos.
    await updateRule(db, userId, rule.id, { pattern: "PADEL CLUB", categoryId: ids.alim, subcategoryId: ids.restaurantes });
    expect((await applyRules(db, userId, "automatic")).changed).toBe(2);
    // Borrar la regla y recalcular: vuelven a "sin categoría" (no se inventa nada).
    await deleteRule(db, userId, rule.id);
    await applyRules(db, userId, "automatic");
    const after = await db.transaction.findMany({ where: { descriptionRaw: { startsWith: "PADEL" }, categorizationSource: { not: "MANUAL" } } });
    expect(after.every((t) => t.categoryId === null)).toBe(true);
  });
});

describe("aprendizaje", () => {
  it("3 correcciones iguales -> sugerencia; aceptarla crea la regla y la aplica", async () => {
    const txs = [];
    for (let i = 0; i < 4; i++) txs.push(await expense(`BAR LA ESQUINA ${i}`));
    for (let i = 0; i < 2; i++) {
      await updateTransaction(db, userId, txs[i]!.id, { descriptionClean: "BAR", categoryId: ids.alim, subcategoryId: ids.restaurantes });
    }
    expect(await getRuleSuggestions(db, userId)).toEqual([]);
    await updateTransaction(db, userId, txs[2]!.id, { descriptionClean: "BAR", categoryId: ids.alim, subcategoryId: ids.restaurantes });
    const [s] = await getRuleSuggestions(db, userId);
    expect(s).toMatchObject({ merchantKey: "BAR ESQUINA", count: 3, label: "Alimentación / Restaurantes", affected: 1 });

    const { rule, applied } = await acceptSuggestion(db, userId, s!);
    expect(rule.origin).toBe("LEARNED");
    expect(applied.changed).toBe(1);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: txs[3]!.id } })).categoryId).toBe(ids.alim);
    expect(await getRuleSuggestions(db, userId)).toEqual([]);
  });

  it("descartar una sugerencia evita que se repita", async () => {
    const txs = [];
    for (let i = 0; i < 3; i++) txs.push(await expense(`KIOSKO PLAZA ${i}`));
    for (const t of txs) await updateTransaction(db, userId, t.id, { descriptionClean: "K", categoryId: ids.ocio, subcategoryId: ids.subs });
    const [s] = await getRuleSuggestions(db, userId);
    expect(s?.merchantKey).toBe("KIOSKO PLAZA");
    await dismissSuggestion(db, userId, s!);
    expect(await getRuleSuggestions(db, userId)).toEqual([]);
  });
});

describe("categorías", () => {
  it("crear, subcategoría, no borrar si está en uso, archivar; las del sistema protegidas", async () => {
    const c = await createCategory(db, userId, { name: "Mascotas", kind: "EXPENSE" });
    await expect(createCategory(db, userId, { name: "Mascotas", kind: "EXPENSE" })).rejects.toThrow(/Ya existe/);
    const sub = await createSubcategory(db, userId, c.id, { name: "Veterinario" });
    const t = await expense("CLINICA VETERINARIA");
    await updateTransaction(db, userId, t.id, { descriptionClean: "VET", categoryId: c.id, subcategoryId: sub.id });
    await expect(deleteSubcategory(db, userId, sub.id)).rejects.toThrow(/archívala/);
    await expect(deleteCategory(db, userId, c.id)).rejects.toThrow(/archívala/);
    await setCategoryArchived(db, userId, c.id, true);
    const transfers = await db.category.findFirstOrThrow({ where: { userId, name: "Transferencias" } });
    await expect(deleteCategory(db, userId, transfers.id)).rejects.toThrow(/sistema/);
    await expect(setCategoryArchived(db, userId, transfers.id, true)).rejects.toThrow(/sistema/);
    const empty = await createCategory(db, userId, { name: "Vacía", kind: "INCOME" });
    await deleteCategory(db, userId, empty.id);
  });
});

describe("transferencias internas", () => {
  it("al importar se vinculan solas si la pareja es única, mutua y con palabra clave", async () => {
    const inSavings = await createManualTransaction(db, userId, {
      accountId: savings, date: utcDate(2026, 9, 6), amount: 30000, description: "TRASPASO DESDE CUENTA PRINCIPAL", kind: "INCOME",
    });
    const csv = "Fecha;Concepto;Importe\n06/09/2026;TRANSFERENCIA A CUENTA AHORRO;-300,00\n07/09/2026;RECIBO LUZ;-50,00\n";
    const { imp } = await createImportFromUpload(db, userId, { accountId: bank, fileName: "t.csv", bytes: new TextEncoder().encode(csv) });
    const { config } = await getMappingStep(db, userId, imp.id);
    await saveImportConfig(db, userId, imp.id, config);
    const r = await commitImport(db, userId, imp.id, { excludeRows: [], adjustOpening: false }, utcDate(2026, 9, 24));
    expect(r.transfersLinked).toBe(1);
    const peer = await db.transaction.findUniqueOrThrow({ where: { id: inSavings.id } });
    expect(peer.transferPeerId).not.toBeNull();
    expect(peer.kind).toBe("TRANSFER");
  });

  it("sin palabra clave: aviso en Revisión; al vincular a mano el aviso se resuelve", async () => {
    const a = await expense("PAGO VARIOS", -7777);
    const b = await createManualTransaction(db, userId, { accountId: savings, date: a.date, amount: 7777, description: "ABONO", kind: "INCOME" });
    const r = await detectTransfers(db, userId, { onlyIds: [a.id] });
    expect(r).toEqual({ linked: 0, flagged: 1 });
    expect((await detectTransfers(db, userId, { onlyIds: [a.id] })).flagged).toBe(0); // no repite el aviso
    expect((await listOpenFlags(db, userId, "POSSIBLE_TRANSFER")).some((f) => f.transactionId === a.id)).toBe(true);
    await linkTransfer(db, userId, a.id, b.id);
    expect((await listOpenFlags(db, userId, "POSSIBLE_TRANSFER")).some((f) => f.transactionId === a.id)).toBe(false);
  });
});

describe("revisión", () => {
  it("resumen, descartar un aviso y confirmar un duplicado", async () => {
    const original = await expense("FARMACIA CENTRO", -1550);
    const dup = await createManualTransaction(
      db, userId, { accountId: bank, date: original.date, amount: -1550, description: "FARMACIA CENTRO", kind: "EXPENSE" }, { allowDuplicate: true },
    );
    const flag = await db.reviewFlag.create({
      data: { userId, type: "POSSIBLE_DUPLICATE", message: "test", transactionId: dup.id, relatedTransactionId: original.id },
    });
    const other = await db.reviewFlag.create({ data: { userId, type: "SUSPICIOUS", message: "x" } });
    const summary = await getReviewSummary(db, userId);
    expect(summary.byType.POSSIBLE_DUPLICATE).toBeGreaterThanOrEqual(1);
    await resolveFlag(db, userId, other.id, "dismiss", "No es relevante");
    expect((await db.reviewFlag.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("DISMISSED");
    await confirmDuplicate(db, userId, flag.id);
    expect(await db.transaction.findUnique({ where: { id: dup.id } })).toBeNull();
    expect(await db.transaction.findUnique({ where: { id: original.id } })).not.toBeNull();
  });
});
