import { decideTransfers, TRANSFER_MAX_DAYS } from "@/domain/transfers";
import { formatDateES } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { inTransaction, type Db } from "./common";
import { linkTransfer } from "./transactions";

/**
 * Detección de transferencias internas entre cuentas propias.
 * - Pareja única, mutua y con palabra clave -> se vinculan solas.
 * - Resto con candidatas -> aviso POSSIBLE_TRANSFER en Revisión.
 * Nunca se vincula por mera coincidencia de importe.
 */
export async function detectTransfers(
  db: Db,
  userId: string,
  opts: { onlyIds?: string[] } = {},
): Promise<{ linked: number; flagged: number }> {
  return inTransaction(db, async (tx) => {
    const base = { userId, transferPeerId: null, categorizationSource: { not: "MANUAL" as const } };
    const targets = await tx.transaction.findMany({
      where: opts.onlyIds ? { ...base, id: { in: opts.onlyIds } } : base,
      select: { id: true, accountId: true, date: true, amount: true, descriptionRaw: true, transferPeerId: true },
      orderBy: { date: "asc" },
    });
    if (targets.length === 0) return { linked: 0, flagged: 0 };

    const min = new Date(Math.min(...targets.map((t) => t.date.getTime())) - TRANSFER_MAX_DAYS * 86_400_000);
    const max = new Date(Math.max(...targets.map((t) => t.date.getTime())) + TRANSFER_MAX_DAYS * 86_400_000);
    const pool = await tx.transaction.findMany({
      where: { userId, transferPeerId: null, date: { gte: min, lte: max } },
      select: { id: true, accountId: true, date: true, amount: true, descriptionRaw: true, transferPeerId: true },
    });
    const withDesc = <T extends { descriptionRaw: string }>(xs: T[]) => xs.map((x) => ({ ...x, description: x.descriptionRaw }));
    const decisions = decideTransfers(withDesc(targets), withDesc(pool));

    let linked = 0;
    let flagged = 0;
    for (const d of decisions) {
      if (d.action === "LINK") {
        await linkTransfer(tx, userId, d.tx.id, d.peer.id);
        linked++;
      } else {
        const exists = await tx.reviewFlag.findFirst({
          where: { userId, type: "POSSIBLE_TRANSFER", transactionId: d.tx.id, status: "OPEN" },
        });
        if (exists) continue;
        const c = d.candidates[0]!;
        await tx.reviewFlag.create({
          data: {
            userId,
            type: "POSSIBLE_TRANSFER",
            transactionId: d.tx.id,
            relatedTransactionId: c.id,
            accountId: d.tx.accountId,
            message:
              d.candidates.length === 1
                ? `¿Transferencia interna? Hay un movimiento de ${formatMoney(c.amount)} el ${formatDateES(c.date)} en otra cuenta.`
                : `¿Transferencia interna? Hay ${d.candidates.length} movimientos con importe opuesto en otras cuentas.`,
            data: JSON.stringify({ candidateIds: d.candidates.map((x) => x.id) }),
          },
        });
        flagged++;
      }
    }
    return { linked, flagged };
  });
}
