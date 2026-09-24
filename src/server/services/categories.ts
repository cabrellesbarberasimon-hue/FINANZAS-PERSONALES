import type { Db } from "./common";

/** Categorías con subcategorías para selectores. */
export async function listCategoryTree(db: Db, userId: string) {
  return db.category.findMany({
    where: { userId, archived: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { subcategories: { where: { archived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
}
export type CategoryTree = Awaited<ReturnType<typeof listCategoryTree>>;
