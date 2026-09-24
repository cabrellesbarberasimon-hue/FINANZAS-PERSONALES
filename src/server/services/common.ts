import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/** Cliente de BD o transacción en curso: los servicios aceptan ambos. */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Error de validación o de negocio con mensaje apto para mostrar al usuario.
 * Cualquier otro error se considera un fallo interno.
 */
export class UserError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "UserError";
  }
}

/** Error de restricción única de Prisma (P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "P2002";
}

export async function writeAudit(
  db: Db,
  entry: {
    userId: string;
    entity: string;
    entityId: string;
    action: "create" | "update" | "delete" | "link" | "unlink";
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: entry.userId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      before: entry.before === undefined ? null : JSON.stringify(entry.before),
      after: entry.after === undefined ? null : JSON.stringify(entry.after),
    },
  });
}

/** Ejecuta `fn` dentro de una transacción si `db` es el cliente raíz. */
export async function inTransaction<T>(db: Db, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if ("$transaction" in db) return (db as PrismaClient).$transaction(fn);
  return fn(db);
}
