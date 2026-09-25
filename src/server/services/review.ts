import type { ReviewFlagType } from "@/generated/prisma/client";
import { inTransaction, UserError, writeAudit, type Db } from "./common";
import { deleteTransaction } from "./transactions";

/**
 * Avisos de calidad del dato (ReviewFlag). Nunca se borran: se resuelven o se
 * descartan, dejando constancia de la decisión.
 */

export async function getReviewSummary(db: Db, userId: string) {
  const [flags, uncategorized, unreviewed] = await Promise.all([
    db.reviewFlag.groupBy({ by: ["type"], where: { userId, status: "OPEN" }, _count: true }),
    db.transaction.count({ where: { userId, categoryId: null } }),
    db.transaction.count({ where: { userId, reviewed: false } }),
  ]);
  const byType = Object.fromEntries(flags.map((f) => [f.type, f._count])) as Partial<Record<ReviewFlagType, number>>;
  return { byType, uncategorized, unreviewed };
}

export async function listOpenFlags(db: Db, userId: string, type?: ReviewFlagType) {
  return db.reviewFlag.findMany({
    where: { userId, status: "OPEN", ...(type ? { type } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      transaction: { include: { account: { select: { name: true } } } },
      relatedTransaction: { include: { account: { select: { name: true } } } },
      account: { select: { id: true, name: true } },
      investment: { select: { id: true, name: true } },
    },
  });
}

export async function resolveFlag(
  db: Db,
  userId: string,
  id: string,
  decision: "resolve" | "dismiss",
  resolution: string,
) {
  const r = await db.reviewFlag.updateMany({
    where: { id, userId, status: "OPEN" },
    data: { status: decision === "resolve" ? "RESOLVED" : "DISMISSED", resolution: resolution.slice(0, 300), resolvedAt: new Date() },
  });
  if (r.count === 0) throw new UserError("El aviso no existe o ya está resuelto.");
}

/** Posible duplicado confirmado: se elimina el movimiento duplicado y se resuelve el aviso. */
export async function confirmDuplicate(db: Db, userId: string, flagId: string) {
  await inTransaction(db, async (tx) => {
    const flag = await tx.reviewFlag.findFirst({ where: { id: flagId, userId, status: "OPEN", type: "POSSIBLE_DUPLICATE" } });
    if (!flag?.transactionId) throw new UserError("El aviso no existe o ya está resuelto.");
    await writeAudit(tx, { userId, entity: "ReviewFlag", entityId: flagId, action: "update", before: flag, after: { resolution: "duplicado eliminado" } });
    // El aviso se borra en cascada con el movimiento; se deja constancia en la auditoría.
    await deleteTransaction(tx, userId, flag.transactionId);
  });
}
