import { mkdirSync } from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl, sqliteFilePath } from "./config";

export type { PrismaClient };

/**
 * Crea un cliente Prisma sobre SQLite (better-sqlite3).
 * Para migrar a PostgreSQL: cambiar `provider` en schema.prisma y usar
 * `@prisma/adapter-pg` aquí; el resto del código no depende del motor.
 */
export function createPrismaClient(url: string = getDatabaseUrl()): PrismaClient {
  const file = sqliteFilePath(url);
  mkdirSync(path.dirname(file), { recursive: true });
  const adapter = new PrismaBetterSqlite3({ url: file });
  return new PrismaClient({ adapter });
}
