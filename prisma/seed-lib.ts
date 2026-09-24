import type { PrismaClient } from "../src/generated/prisma/client";
import { SEED_CATEGORIES } from "./seed-data/categories";
import { SEED_RULES } from "./seed-data/rules";

/**
 * Seed IDEMPOTENTE: se puede ejecutar varias veces. Crea lo que falta y nunca
 * borra, renombra ni modifica datos existentes del usuario.
 */
export async function seedBase(db: PrismaClient, userName = "Yo"): Promise<{ userId: string }> {
  let user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) user = await db.user.create({ data: { name: userName } });

  for (const [i, c] of SEED_CATEGORIES.entries()) {
    const category = await db.category.upsert({
      where: { userId_name: { userId: user.id, name: c.name } },
      create: {
        userId: user.id, name: c.name, kind: c.kind, icon: c.icon, color: c.color,
        isSystem: c.isSystem ?? false, sortOrder: i,
      },
      update: {},
    });
    for (const [j, s] of c.subcategories.entries()) {
      const name = typeof s === "string" ? s : s.name;
      const extraordinary = typeof s === "string" ? false : s.extraordinary;
      await db.subcategory.upsert({
        where: { categoryId_name: { categoryId: category.id, name } },
        create: { categoryId: category.id, name, sortOrder: j, isExtraordinaryDefault: extraordinary },
        update: {},
      });
    }
  }

  const hasSystemRules = await db.categorizationRule.count({
    where: { userId: user.id, origin: "SYSTEM" },
  });
  if (hasSystemRules === 0) {
    const categories = await db.category.findMany({
      where: { userId: user.id },
      include: { subcategories: true },
    });
    for (const r of SEED_RULES) {
      const cat = categories.find((c) => c.name === r.category);
      const sub = cat?.subcategories.find((s) => s.name === r.subcategory);
      if (!cat || !sub) throw new Error(`Regla semilla inválida: ${r.pattern} -> ${r.category}/${r.subcategory}`);
      await db.categorizationRule.create({
        data: {
          userId: user.id, pattern: r.pattern, field: "DESCRIPTION", matchType: "CONTAINS",
          categoryId: cat.id, subcategoryId: sub.id, origin: "SYSTEM", priority: 0,
        },
      });
    }
  }

  return { userId: user.id };
}
