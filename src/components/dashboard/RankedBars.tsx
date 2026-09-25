import Link from "next/link";
import { formatMoney, formatPercent } from "@/domain/money";

/**
 * Barras horizontales ordenadas (parte de un todo / ranking).
 * Una sola tinta: la identidad la da la etiqueta de cada fila, no el color.
 * Cada fila enlaza a las operaciones o cuentas que la forman.
 */
export function RankedBars({
  rows,
  total,
  ariaLabel,
}: {
  rows: Array<{ key: string; label: string; value: number; share?: number | null; href?: string; hint?: string }>;
  total: number;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <table className="w-full border-collapse text-sm" aria-label={ariaLabel}>
      <tbody>
        {rows.map((r) => {
          const share = r.share ?? (total > 0 ? (r.value / total) * 100 : null);
          const title = `${r.label}: ${formatMoney(r.value)}${share !== null ? ` · ${formatPercent(share)}` : ""}${r.hint ? ` · ${r.hint}` : ""}`;
          const label = r.href ? (
            <Link href={r.href} className="hover:underline">
              {r.label}
            </Link>
          ) : (
            r.label
          );
          return (
            <tr key={r.key} className="group" title={title}>
              <td className="py-1.5 pr-3 align-middle">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{label}</span>
                  <span className="shrink-0 tabular-nums text-ink">
                    {formatMoney(r.value, { decimals: 0 })}
                    {share !== null && <span className="ml-1.5 text-xs text-muted">{formatPercent(share, { decimals: 0 })}</span>}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-canvas">
                  <div
                    className="h-2 rounded-full bg-[#2a78d6] transition-opacity group-hover:opacity-80"
                    style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }}
                  />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
