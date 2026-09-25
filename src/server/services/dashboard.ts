import { summarizeCashflow, type CashflowSummary } from "@/domain/cashflow";
import { addMonths, monthKey, monthRange, utcDate } from "@/domain/dates";
import { compareNetWorth, type Change } from "@/domain/networth";
import type { Db } from "./common";
import { getPortfolio, type Portfolio } from "./investments";
import { netWorthAt, type NetWorthSnapshotView } from "./networth";

/** Último día del mes "YYYY-MM". */
export function monthEnd(key: string): Date {
  return new Date(monthRange(key).end.getTime() - 86_400_000);
}

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  color: string | null;
  total: number;
  count: number;
}

export interface Dashboard {
  month: string;
  isCurrentMonth: boolean;
  /** Fecha a la que se calcula el patrimonio: hoy (mes en curso) o fin de mes. */
  date: Date;
  netWorth: NetWorthSnapshotView;
  previousMonthEnd: NetWorthSnapshotView;
  yearAgo: NetWorthSnapshotView;
  changeMonth: Change;
  changeYear: Change;
  cashflow: CashflowSummary;
  previousCashflow: CashflowSummary;
  topExpenses: CategoryTotal[];
  review: { uncategorized: number; openFlags: number; staleInvestments: number };
  portfolio: Portfolio;
  hasData: boolean;
}

async function monthCashflow(db: Db, userId: string, key: string) {
  const { start, end } = monthRange(key);
  return db.transaction.findMany({
    where: { userId, date: { gte: start, lt: end } },
    select: { id: true, amount: true, kind: true, categoryId: true },
  });
}

export async function getDashboard(db: Db, userId: string, month: string, today: Date): Promise<Dashboard> {
  const isCurrentMonth = month === monthKey(today);
  const date = isCurrentMonth ? today : monthEnd(month);
  const prevEnd = monthEnd(addMonths(month, -1));
  const yearAgoDate = utcDate(date.getUTCFullYear() - 1, date.getUTCMonth() + 1, date.getUTCDate());

  const [netWorth, previousMonthEnd, yearAgo, txs, prevTxs, categories, uncategorized, openFlags, accounts, portfolio] = await Promise.all([
    netWorthAt(db, userId, date),
    netWorthAt(db, userId, prevEnd),
    netWorthAt(db, userId, yearAgoDate),
    monthCashflow(db, userId, month),
    monthCashflow(db, userId, addMonths(month, -1)),
    db.category.findMany({ where: { userId }, select: { id: true, name: true, color: true } }),
    db.transaction.count({ where: { userId, categoryId: null } }),
    db.reviewFlag.count({ where: { userId, status: "OPEN" } }),
    db.account.count({ where: { userId } }),
    getPortfolio(db, userId, date),
  ]);

  // Gasto por categoría (neto de reembolsos), solo movimientos de tipo gasto.
  const byCat = new Map<string | null, { total: number; count: number }>();
  for (const t of txs) {
    if (t.kind !== "EXPENSE") continue;
    const c = byCat.get(t.categoryId) ?? { total: 0, count: 0 };
    c.total += -t.amount;
    c.count++;
    byCat.set(t.categoryId, c);
  }
  const topExpenses = [...byCat.entries()]
    .map(([categoryId, v]) => {
      const cat = categories.find((c) => c.id === categoryId);
      return { categoryId, name: cat?.name ?? "Sin categoría", color: cat?.color ?? null, ...v };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return {
    month,
    isCurrentMonth,
    date,
    netWorth,
    previousMonthEnd,
    yearAgo,
    changeMonth: compareNetWorth(netWorth, previousMonthEnd),
    changeYear: compareNetWorth(netWorth, yearAgo),
    cashflow: summarizeCashflow(txs),
    previousCashflow: summarizeCashflow(prevTxs),
    topExpenses,
    review: { uncategorized, openFlags, staleInvestments: portfolio.stale.length },
    portfolio,
    hasData: accounts > 0,
  };
}
