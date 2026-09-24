import "server-only";
import { createPrismaClient, type PrismaClient } from "./prisma";

/**
 * Cliente Prisma único para el proceso de Next.js. En desarrollo el módulo se
 * recarga en caliente; guardarlo en globalThis evita abrir cientos de conexiones.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
