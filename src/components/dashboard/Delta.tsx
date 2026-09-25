import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import clsx from "clsx";
import { formatMoney, formatPercent } from "@/domain/money";

/**
 * Variación con signo + flecha + color (nunca solo color).
 * `goodWhen="down"` para magnitudes donde bajar es bueno (gastos).
 */
export function Delta({
  cents,
  pct,
  label,
  goodWhen = "up",
  pendingReason,
}: {
  cents: number | null;
  pct?: number | null;
  label: string;
  goodWhen?: "up" | "down";
  pendingReason?: string;
}) {
  if (cents === null) {
    return (
      <p className="text-xs text-muted" title={pendingReason}>
        {label}: <span className="font-medium text-warning">Pendiente de datos</span>
      </p>
    );
  }
  const up = cents > 0;
  const flat = cents === 0;
  const good = flat ? null : goodWhen === "up" ? up : !up;
  const Icon = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="flex items-center gap-1 text-xs">
      <span className={clsx("inline-flex items-center gap-0.5 font-medium tabular-nums", good === true && "text-positive", good === false && "text-negative", good === null && "text-muted")}>
        <Icon className="size-3.5" aria-hidden />
        {formatMoney(cents, { signed: true, decimals: 0 })}
        {pct !== undefined && pct !== null && ` (${formatPercent(pct, { signed: true })})`}
      </span>
      <span className="text-muted">{label}</span>
    </p>
  );
}
