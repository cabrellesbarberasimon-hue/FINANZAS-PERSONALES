import { formatMoney } from "@/domain/money";

/**
 * Gráfico de líneas mínimo en SVG (sin dependencias).
 * - Una sola escala Y (nunca doble eje), empezando en 0.
 * - Hasta 2-3 series: colores fijos de la paleta validada, leyenda + etiqueta
 *   directa al final de cada línea (la identidad nunca depende solo del color).
 * - Puntos nulos = hueco en la línea ("pendiente de datos"), no se interpolan.
 * - Tooltip nativo por punto; la tabla de datos va aparte (accesibilidad).
 */

export interface Series {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
  dashed?: boolean;
}

const W = 640;
const H = 240;
const PAD = { top: 16, right: 96, bottom: 28, left: 64 };

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export function LineChart({ labels, series, ariaLabel }: { labels: string[]; series: Series[]; ariaLabel: string }) {
  if (labels.length === 0) return null;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null))));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.max(1, Math.ceil(labels.length / 8));

  // Etiquetas directas al final de cada serie, separadas para que no se pisen.
  const endLabels = series
    .map((s) => {
      const i = s.values.map((v, k) => (v === null ? -1 : k)).filter((k) => k >= 0).pop();
      return i === undefined ? null : { key: s.key, label: s.label, x: x(i) + 8, y: y(s.values[i]!) + 4 };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < endLabels.length; k++) {
    if (endLabels[k]!.y - endLabels[k - 1]!.y < 13) endLabels[k]!.y = endLabels[k - 1]!.y + 13;
  }

  return (
    <figure className="w-full">
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted" aria-hidden>
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg width="18" height="6">
              <line x1="0" y1="3" x2="18" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "4 3" : undefined} />
              {endLabels.map((l) => (
          <text key={l.key} x={l.x} y={l.y} fontSize="11" fill="#101828">
            {l.label}
          </text>
        ))}
      </svg>
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e4e7ec" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#667085">
              {formatMoney(Math.round(t), { decimals: 0 })}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % labelEvery === 0 || i === labels.length - 1 ? (
            <text key={l} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#667085">
              {l}
            </text>
          ) : null,
        )}
        {series.map((s) => {
          // Segmentos continuos (los nulos cortan la línea).
          const segments: Array<Array<[number, number]>> = [];
          let cur: Array<[number, number]> = [];
          s.values.forEach((v, i) => {
            if (v === null) {
              if (cur.length) segments.push(cur);
              cur = [];
            } else cur.push([x(i), y(v)]);
          });
          if (cur.length) segments.push(cur);
          return (
            <g key={s.key}>
              {segments.map((seg, k) =>
                seg.length > 1 ? (
                  <polyline
                    key={k}
                    points={seg.map(([a, b]) => `${a},${b}`).join(" ")}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={s.dashed ? "5 4" : undefined}
                  />
                ) : null,
              )}
              {s.values.map((v, i) =>
                v === null ? null : (
                  <circle key={i} cx={x(i)} cy={y(v)} r="4" fill={s.color} stroke="#fff" strokeWidth="2">
                    <title>{`${labels[i]} · ${s.label}: ${formatMoney(v)}`}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
        {endLabels.map((l) => (
          <text key={l.key} x={l.x} y={l.y} fontSize="11" fill="#101828">
            {l.label}
          </text>
        ))}
      </svg>
    </figure>
  );
}
