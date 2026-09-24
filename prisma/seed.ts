import "dotenv/config";
import { createPrismaClient } from "../src/server/prisma";
import { getAppMode, getDatabaseUrl } from "../src/server/config";
import { seedBase } from "./seed-lib";

async function main() {
  const db = createPrismaClient();
  try {
    const { userId } = await seedBase(db);
    const [categories, rules] = await Promise.all([
      db.category.count({ where: { userId } }),
      db.categorizationRule.count({ where: { userId } }),
    ]);
    console.log(`[seed] modo=${getAppMode()} db=${getDatabaseUrl()} categorías=${categories} reglas=${rules}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
