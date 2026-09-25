import { z } from "zod";
import type { CategoryKind } from "@/generated/prisma/client";
import { inTransaction, isUniqueViolation, UserError, writeAudit, type Db } from "./common";

/** Categorías con subcategorías para selectores. */
export async function listCategoryTree(db: Db, userId: string) {
  return db.category.findMany({
    where: { userId, archived: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { subcategories: { where: { archived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
}
export type CategoryTree = Awaited<ReturnType<typeof listCategoryTree>>;

/** Árbol completo (incluidas archivadas) con recuento de uso, para Configuración. */
export async function listCategoriesWithUsage(db: Db, userId: string) {
  const cats = await db.category.findMany({
    where: { userId },
    orderBy: [{ archived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      subcategories: {
        orderBy: [{ archived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { transactions: true, rules: true, budgets: true } } },
      },
      _count: { select: { transactions: true, rules: true, budgets: true } },
    },
  });
  return cats;
}

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  EXPENSE: "Gasto",
  INCOME: "Ingreso",
  TRANSFER: "Transferencia",
  INVESTMENT: "Inversión",
};

const nameSchema = z.string().trim().min(1, "El nombre es obligatorio").max(60);

function parseName(v: unknown): string {
  const r = nameSchema.safeParse(v);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Nombre no válido", { name: "No válido" });
  return r.data;
}

async function withUnique<T>(fn: () => Promise<T>, msg: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError(msg, { name: "Repetido" });
    throw e;
  }
}

export async function createCategory(db: Db, userId: string, input: { name: string; kind: CategoryKind; color?: string }) {
  const name = parseName(input.name);
  if (!["EXPENSE", "INCOME", "TRANSFER", "INVESTMENT"].includes(input.kind)) throw new UserError("Tipo no válido.");
  return withUnique(
    () =>
      inTransaction(db, async (tx) => {
        const max = await tx.category.aggregate({ where: { userId }, _max: { sortOrder: true } });
        const c = await tx.category.create({
          data: { userId, name, kind: input.kind, color: input.color ?? null, sortOrder: (max._max.sortOrder ?? 0) + 1 },
        });
        await writeAudit(tx, { userId, entity: "Category", entityId: c.id, action: "create", after: c });
        return c;
      }),
    "Ya existe una categoría con ese nombre.",
  );
}

/**
 * Renombrar no cambia ningún cálculo (todo va por id). El TIPO no se puede
 * cambiar en una categoría con movimientos: alteraría ingresos/gastos pasados.
 */
export async function updateCategory(db: Db, userId: string, id: string, input: { name: string; color?: string | null }) {
  const name = parseName(input.name);
  return withUnique(
    () =>
      inTransaction(db, async (tx) => {
        const before = await tx.category.findFirst({ where: { id, userId } });
        if (!before) throw new UserError("La categoría no existe.");
        const after = await tx.category.update({ where: { id }, data: { name, color: input.color ?? before.color } });
        await writeAudit(tx, { userId, entity: "Category", entityId: id, action: "update", before, after });
        return after;
      }),
    "Ya existe una categoría con ese nombre.",
  );
}

export async function setCategoryArchived(db: Db, userId: string, id: string, archived: boolean) {
  const cat = await db.category.findFirst({ where: { id, userId } });
  if (!cat) throw new UserError("La categoría no existe.");
  if (cat.isSystem && archived) throw new UserError("Las categorías del sistema no se pueden archivar.");
  await db.category.update({ where: { id }, data: { archived } });
}

/** Solo se borran categorías sin uso; si tienen historial, se archivan. */
export async function deleteCategory(db: Db, userId: string, id: string) {
  await inTransaction(db, async (tx) => {
    const cat = await tx.category.findFirst({
      where: { id, userId },
      include: { _count: { select: { transactions: true, rules: true, budgets: true } } },
    });
    if (!cat) throw new UserError("La categoría no existe.");
    if (cat.isSystem) throw new UserError("Las categorías del sistema no se pueden borrar.");
    const { transactions, rules, budgets } = cat._count;
    if (transactions + rules + budgets > 0) {
      throw new UserError(`Está en uso (${transactions} movimientos, ${rules} reglas, ${budgets} presupuestos): archívala en lugar de borrarla.`);
    }
    const { _count, ...before } = cat;
    await tx.category.delete({ where: { id } });
    await writeAudit(tx, { userId, entity: "Category", entityId: id, action: "delete", before });
  });
}

async function ownedSub(db: Db, userId: string, id: string) {
  const sub = await db.subcategory.findFirst({
    where: { id, category: { userId } },
    include: { _count: { select: { transactions: true, rules: true, budgets: true } } },
  });
  if (!sub) throw new UserError("La subcategoría no existe.");
  return sub;
}

export async function createSubcategory(db: Db, userId: string, categoryId: string, input: { name: string }) {
  const name = parseName(input.name);
  const cat = await db.category.findFirst({ where: { id: categoryId, userId } });
  if (!cat) throw new UserError("La categoría no existe.");
  return withUnique(async () => {
    const max = await db.subcategory.aggregate({ where: { categoryId }, _max: { sortOrder: true } });
    const s = await db.subcategory.create({ data: { categoryId, name, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    await writeAudit(db, { userId, entity: "Subcategory", entityId: s.id, action: "create", after: s });
    return s;
  }, "Ya existe una subcategoría con ese nombre en esta categoría.");
}

export async function renameSubcategory(db: Db, userId: string, id: string, input: { name: string }) {
  const name = parseName(input.name);
  const before = await ownedSub(db, userId, id);
  return withUnique(async () => {
    const after = await db.subcategory.update({ where: { id }, data: { name } });
    await writeAudit(db, { userId, entity: "Subcategory", entityId: id, action: "update", before, after });
    return after;
  }, "Ya existe una subcategoría con ese nombre en esta categoría.");
}

export async function setSubcategoryArchived(db: Db, userId: string, id: string, archived: boolean) {
  await ownedSub(db, userId, id);
  await db.subcategory.update({ where: { id }, data: { archived } });
}

export async function deleteSubcategory(db: Db, userId: string, id: string) {
  const sub = await ownedSub(db, userId, id);
  const { transactions, rules, budgets } = sub._count;
  if (transactions + rules + budgets > 0) {
    throw new UserError(`Está en uso (${transactions} movimientos, ${rules} reglas, ${budgets} presupuestos): archívala en lugar de borrarla.`);
  }
  await db.subcategory.delete({ where: { id } });
  const { _count, ...before } = sub;
  await writeAudit(db, { userId, entity: "Subcategory", entityId: id, action: "delete", before });
}
