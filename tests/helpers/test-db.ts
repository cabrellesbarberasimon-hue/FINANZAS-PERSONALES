import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createPrismaClient, type PrismaClient } from "@/server/prisma";

/**
 * Base de datos SQLite temporal con todas las migraciones aplicadas.
 * Cada test suite obtiene la suya: nunca se toca data/finanzas.db.
 */
export async function createTestDb(): Promise<{ db: PrismaClient; cleanup: () => Promise<void> }> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "finanzas-test-"));
  const file = path.join(dir, "test.db");
  const raw = new Database(file);
  const migrationsDir = path.resolve(__dirname, "../../prisma/migrations");
  for (const m of readdirSync(migrationsDir).filter((d) => /^\d+_/.test(d)).sort()) {
    raw.exec(readFileSync(path.join(migrationsDir, m, "migration.sql"), "utf8"));
  }
  raw.close();
  const db = createPrismaClient(`file:${file}`);
  return {
    db,
    cleanup: async () => {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
