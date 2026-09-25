import { formatMoney, formatPercent } from "@/domain/money";
import { PendingData } from "./PendingData";

/** Ganancia/pérdida con signo, color y porcentaje; "Pendiente de datos" si no hay valoración. */
export function Gain({ cents, pct, decimals = 2 }: { cents: number | null; pct?: number | null; decimals?: 0 | 2 }) {
  if (cents === null) return <PendingData reason="Falta la valoración actual." />;
  const cls = cents > 0 ? "text-positive" : cents < 0 ? "text-negative" : "";
  return (
    <span className={`whitespace-nowrap tabular-nums ${cls}`}>
      {formatMoney(cents, { signed: true, decimals })}
      {pct !== undefined && pct !== null && <span className="ml-1 text-[0.85em]">({formatPercent(pct, { signed: true })})</span>}
    </span>
  );
}
