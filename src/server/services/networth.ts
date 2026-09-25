import { balanceMethod, latestDeclared } from "@/domain/accounts";
import { formatDateES } from "@/domain/dates";
import { accountGroup, computeNetWorth, type AssetItem, type LiabilityItem, type NetWorth } from "@/domain/networth";
import type { Db } from "./common";

/**
 * Patrimonio a una fecha (al FINAL de ese día), calculado siempre desde los
 * datos de origen: saldos iniciales, movimientos, saldos declarados y deudas.
 *
 * - Cuentas archivadas: excluidas (cuentas cerradas).
 * - Cuenta cuyo saldo inicial es posterior a la fecha: valor desconocido
 *   ("pendiente"), nunca 0.
 * - Deuda sin saldo registrado a esa fecha: pendiente, salvo que empiece después.
 */
export interface NetWorthSnapshotView extends NetWorth {
  date: Date;
  items: AssetItem[];
  liabilityItems: LiabilityItem[];
}

export async function netWorthAt(db: Db, userId: string, date: Date): Promise<NetWorthSnapshotView> {
  const [accounts, liabilities, investments] = await Promise.all([
    db.account.findMany({
      where: { userId, archived: false },
      include: { balances: { where: { date: { lte: date } }, orderBy: { date: "desc" }, take: 5 } },
      orderBy: { name: "asc" },
    }),
    db.liability.findMany({
      where: { userId },
      include: { balances: { where: { date: { lte: date } }, orderBy: { date: "desc" }, take: 1 } },
    }),
    db.investment.findMany({ where: { userId, archived: false }, select: { id: true, name: true, currency: true } }),
  ]);

  const items: AssetItem[] = [];
  for (const a of accounts) {
    const { group, bucket } = accountGroup(a.type);
    const base = { id: a.id, name: a.name, kind: "account" as const, group, bucket, currency: a.currency };
    if (date < a.openingDate) {
      items.push({ ...base, value: null, pendingReason: `Solo hay datos desde el ${formatDateES(a.openingDate)} (saldo inicial).` });
      continue;
    }
    if (balanceMethod(a.type) === "DECLARED") {
      const d = latestDeclared([
        { date: a.openingDate, balance: a.openingBalance },
        ...a.balances.filter((b) => b.date >= a.openingDate),
      ]);
      items.push({ ...base, value: d?.balance ?? null, asOf: d?.date ?? null });
      continue;
    }
    const agg = await db.transaction.aggregate({
      where: { accountId: a.id, date: { gt: a.openingDate, lte: date } },
      _sum: { amount: true },
    });
    items.push({ ...base, value: a.openingBalance + (agg._sum.amount ?? 0), asOf: date });
  }

  // Inversiones detalladas: su valoración llega en la fase 6. Hasta entonces se
  // muestran como pendientes en lugar de suponer un valor.
  for (const inv of investments) {
    items.push({
      id: inv.id, name: inv.name, kind: "investment", group: "INVESTMENT_OTHER", bucket: "INVESTMENTS",
      currency: inv.currency, value: null, pendingReason: "Valoración de inversiones disponible en la fase 6.",
    });
  }

  const liabilityItems: LiabilityItem[] = [];
  for (const l of liabilities) {
    const b = l.balances[0];
    if (b) {
      liabilityItems.push({ id: l.id, name: l.name, value: b.balance, asOf: b.date });
    } else if (l.startDate && date < l.startDate) {
      continue; // aún no existía
    } else if (!l.archived) {
      liabilityItems.push({ id: l.id, name: l.name, value: null, pendingReason: "Sin saldo pendiente registrado a esta fecha." });
    }
  }

  return { ...computeNetWorth(items, liabilityItems), date, items, liabilityItems };
}
