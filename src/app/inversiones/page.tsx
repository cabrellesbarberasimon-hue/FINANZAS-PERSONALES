import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { LineChart } from "@/components/charts/LineChart";
import { BreakdownRow, Kpi } from "@/components/dashboard/Kpi";
import { RankedBars } from "@/components/dashboard/RankedBars";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Gain } from "@/components/ui/Gain";
import { Irr } from "@/components/ui/Irr";
import { Money } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { PendingData } from "@/components/ui/PendingData";
import { buttonClass } from "@/components/ui/styles";
import { Table, Td, Th } from "@/components/ui/Table";
import { daysBetween, formatDateES, monthLabel, today } from "@/domain/dates";
import { formatDecimal, formatMoney, formatPercent, percentage } from "@/domain/money";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { ASSET_TYPE_LABELS, getPortfolio } from "@/server/services/investments";
import { netWorthAt } from "@/server/services/networth";

export const metadata: Metadata = { title: "Inversiones" };

export default async function InvestmentsPage() {
  const userId = await getCurrentUserId();
  const now = today();
  const [p, nw] = await Promise.all([getPortfolio(db, userId, now), netWorthAt(db, userId, now)]);
  const active = p.rows.filter((r) => r.position && r.position.transactionIds.length > 0);
  const firstDate = active.reduce<Date | null>((m, r) => (r.position!.firstDate && (!m || r.position!.firstDate < m) ? r.position!.firstDate : m), null);
  const seriesHasGaps = p.series.some((s) => s.value === null);
  const investedShare = nw.complete && nw.assets > 0 ? percentage(nw.investments, nw.netWorth) : null;
  const shortMonth = (m: string) => {
    const [name, y] = monthLabel(m).split(" ");
    return `${name!.slice(0, 3)} ${y!.slice(2)}`;
  };

  return (
    <>
      <PageHeader
        title="Inversiones"
        description="Aportaciones y rentabilidad, siempre por separado: aportar más no es ganar más."
        actions={
          <Link href="/inversiones/nueva" className={buttonClass()}>
            <Plus className="size-4" /> Inversión
          </Link>
        }
      />

      {p.rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            Aún no hay inversiones. <Link className="text-info hover:underline" href="/inversiones/nueva">Registra la primera</Link> (fondo indexado, ETF,
            plan de pensiones…) y después sus aportaciones y su valor liquidativo.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              title="Valor actual"
              value={p.value > 0 || p.complete ? <Money cents={p.value} neutral decimals={0} /> : <PendingData />}
              breakdown={active.map((r) => (
                <BreakdownRow
                  key={r.inv.id}
                  label={r.inv.name}
                  href={`/inversiones/${r.inv.id}`}
                  value={r.position!.value === null ? <span className="text-warning">pendiente</span> : formatMoney(r.position!.value)}
                />
              ))}
            >
              {!p.complete && <p className="text-xs text-warning">Incompleto: hay inversiones sin valoración.</p>}
              {investedShare !== null && (
                <p className="text-xs text-muted">
                  <span className="font-medium text-ink">{formatPercent(investedShare)}</span> de tu patrimonio neto
                </p>
              )}
            </Kpi>
            <Kpi
              title="Capital aportado"
              value={<Money cents={p.contributed} neutral decimals={0} />}
              breakdown={
                <>
                  {active.map((r) => (
                    <BreakdownRow key={r.inv.id} label={r.inv.name} href={`/inversiones/${r.inv.id}`} value={formatMoney(r.position!.contributed)} />
                  ))}
                  <p className="text-xs text-muted">Compras + sus comisiones + comisiones sueltas.</p>
                </>
              }
            >
              {p.withdrawn > 0 && <p className="text-xs text-muted">Retirado (ventas y dividendos): {formatMoney(p.withdrawn)}</p>}
            </Kpi>
            <Kpi
              title="Ganancia / pérdida"
              value={<Gain cents={p.totalGain} decimals={0} />}
              breakdown={
                p.totalGain !== null && (
                  <>
                    <BreakdownRow label="Valor actual" value={formatMoney(p.value)} />
                    <BreakdownRow label="+ Retirado" value={formatMoney(p.withdrawn)} />
                    <BreakdownRow label="− Capital aportado" value={formatMoney(-p.contributed)} />
                    <BreakdownRow label={<strong>= Ganancia</strong>} value={<strong>{formatMoney(p.totalGain)}</strong>} />
                  </>
                )
              }
            >
              <p className="text-xs text-muted">
                Rentabilidad simple: <span className="font-medium text-ink">{formatPercent(p.simpleReturn, { signed: true })}</span>
              </p>
            </Kpi>
            <Kpi
              title="Rentabilidad anual (TIR)"
              value={<Irr irr={p.irr} since={firstDate} asOf={now} />}
              breakdown={
                <p className="text-xs text-muted">
                  Tasa anual que iguala tus aportaciones y retiradas, en sus fechas, con el valor actual. A diferencia de la rentabilidad simple, tiene
                  en cuenta cuánto tiempo ha estado invertido cada euro. Con menos de un año de historia, compárala con cautela.
                </p>
              }
            >
              <p className="text-xs text-muted">Ponderada por aportaciones y fechas.</p>
              {firstDate && daysBetween(firstDate, now) < 365 && (
                <p className="text-xs text-warning">&lt;1a: menos de un año de historia; la cifra anualizada exagera. Mira la rentabilidad simple.</p>
              )}
            </Kpi>
          </div>

          {p.stale.length > 0 && (
            <div className="mt-6 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Valoración de hace más de 35 días en:{" "}
                {p.stale.map((r, i) => (
                  <span key={r.inv.id}>
                    {i > 0 && ", "}
                    <Link className="underline" href={`/inversiones/${r.inv.id}`}>
                      {r.inv.name}
                    </Link>{" "}
                    ({formatDateES(r.position!.valuation!.date)})
                  </span>
                ))}
                . Actualiza el valor liquidativo para que las cifras sean actuales.
              </span>
            </div>
          )}

          <Card className="mt-6 p-0 sm:p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Inversión</Th>
                  <Th align="right" className="hidden lg:table-cell">Participaciones</Th>
                  <Th align="right" className="hidden lg:table-cell">Precio medio</Th>
                  <Th align="right" className="hidden md:table-cell">Aportado</Th>
                  <Th align="right">Valor</Th>
                  <Th align="right">Ganancia</Th>
                  <Th align="right" className="hidden sm:table-cell">TIR</Th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map(({ inv, position: pos, error, irr }) => (
                  <tr key={inv.id} className="hover:bg-canvas/60">
                    <Td>
                      <Link href={`/inversiones/${inv.id}`} className="font-medium hover:underline">
                        {inv.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                        {ASSET_TYPE_LABELS[inv.assetType]}
                        {inv.platform && ` · ${inv.platform}`}
                        {pos?.valuation && ` · valorado ${formatDateES(pos.valuation.date)}`}
                        {pos?.stale && <Badge tone="warning">Sin actualizar</Badge>}
                        {error && <Badge tone="negative">{error}</Badge>}
                      </div>
                    </Td>
                    <Td align="right" className="hidden tabular-nums lg:table-cell">
                      {inv.valuationMode === "UNITS" && pos ? formatDecimal(pos.units) : "—"}
                    </Td>
                    <Td align="right" className="hidden tabular-nums lg:table-cell">
                      {pos?.averagePrice ? formatDecimal(pos.averagePrice, 4) : "—"}
                    </Td>
                    <Td align="right" className="hidden md:table-cell">
                      {pos ? <Money cents={pos.contributed} neutral /> : "—"}
                    </Td>
                    <Td align="right">{pos?.value != null ? <Money cents={pos.value} neutral /> : <PendingData />}</Td>
                    <Td align="right">{pos ? <Gain cents={pos.totalGain} pct={pos.simpleReturn} /> : "—"}</Td>
                    <Td align="right" className="hidden sm:table-cell">
                      <Irr irr={irr} since={pos?.firstDate ?? null} asOf={now} compact />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          {p.series.length > 0 && (
            <Card className="mt-6">
              <h2 className="mb-3 text-base font-semibold">Evolución: valor frente a capital aportado</h2>
              <LineChart
                ariaLabel="Evolución mensual del valor de la cartera y del capital aportado"
                labels={p.series.map((s) => shortMonth(s.month))}
                series={[
                  { key: "value", label: "Valor", color: "#2a78d6", values: p.series.map((s) => s.value) },
                  { key: "contrib", label: "Aportado", color: "#eb6834", values: p.series.map((s) => s.contributedCumulative), dashed: true },
                ]}
              />
              <p className="mt-2 text-xs text-muted">
                La distancia entre las dos líneas es la ganancia o pérdida acumulada; las subidas de la línea discontinua son aportaciones, no
                rentabilidad.
              </p>
              {seriesHasGaps && (
                <p className="mt-1 text-xs text-warning">
                  Los meses sin línea de valor son meses en los que alguna inversión no tenía valoración registrada: el valor queda pendiente en vez
                  de estimarse.
                </p>
              )}
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs font-medium text-info">Ver tabla y aportaciones mensuales</summary>
                <div className="mt-2">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Mes</Th>
                        <Th align="right">Aportado en el mes</Th>
                        <Th align="right">Aportado acumulado</Th>
                        <Th align="right">Valor</Th>
                        <Th align="right">Ganancia</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...p.series].reverse().map((s) => (
                        <tr key={s.month}>
                          <Td className="capitalize">{monthLabel(s.month)}</Td>
                          <Td align="right">{formatMoney(s.netContribution)}</Td>
                          <Td align="right">{formatMoney(s.contributedCumulative)}</Td>
                          <Td align="right">{s.value === null ? <PendingData /> : formatMoney(s.value)}</Td>
                          <Td align="right">
                            <Gain cents={s.value === null ? null : s.value - s.contributedCumulative} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <p className="mt-2 text-xs text-muted">Ganancia mensual aproximada: valor − aportado acumulado (no descuenta retiradas).</p>
                </div>
              </details>
            </Card>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {[
              { title: "Por tipo de activo", rows: p.byType },
              { title: "Por inversión", rows: p.byInvestment },
              { title: "Por plataforma", rows: p.byPlatform },
            ].map(({ title, rows }) => (
              <Card key={title}>
                <h2 className="mb-3 text-base font-semibold">{title}</h2>
                {rows.length === 0 ? (
                  <PendingData />
                ) : (
                  <RankedBars
                    ariaLabel={title}
                    total={p.value}
                    rows={rows.map((r) => ({
                      ...r,
                      href: title === "Por inversión" ? `/inversiones/${r.key}` : undefined,
                    }))}
                  />
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
