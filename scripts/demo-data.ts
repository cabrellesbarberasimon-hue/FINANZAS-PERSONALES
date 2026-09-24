import type { PrismaClient } from "../src/generated/prisma/client";

/**
 * Datos ficticios para desarrollo. Solo se ejecuta contra data/demo.db.
 * Fase 1: únicamente usuario, categorías y reglas (seedBase).
 * Fase 2 añadirá cuentas y movimientos; fase 6, inversiones; etc.
 */
export async function seedDemoData(_db: PrismaClient): Promise<void> {
  // Intencionadamente vacío en la fase 1.
}
