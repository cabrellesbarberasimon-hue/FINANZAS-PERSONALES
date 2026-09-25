import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { LineChart } from "@/components/charts/LineChart";
import { BreakdownRow, Kpi } from "@/components/dashboard/Kpi";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Gain } from "@/components/ui/Gain";
import { Irr } from "@/components/ui/Irr";
import { InlineActionButton } from "@/components/ui/InlineActionButton";
import { Money } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { PendingData } from "@/components/ui/PendingData";
import { Table, Td, Th } from "@/components/ui/Table";
import { daysBetween, formatDateES, monthLabel, toISODate, today } from "@/domain/dates";
import { formatDecimal, formatMoney, formatPercent } from "@/domain/money";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { UserError } from "@/server/services/common";
import { ASSET_TYPE_LABELS, getInvestmentDetail, INV_TX_LABELS, linkableMovements } from "@/server/services/investments";
import {
  addOperationAction,
  addPriceAction,
  archiveInvestmentAction,
  deleteInvestmentAction,
  deleteOperationAction,
  deletePriceAction,
  updateInvestmentAction,
} from "../actions";
import { InvestmentForm } from "../InvestmentForm";
import { OperationForm } from "./OperationForm";
import { PriceForm } from "./PriceForm";

export const metadata: Metadata = { title: "Inversión" };

export default async function InvestmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  const now = today();
  let d;
  try {
    d = await getInvestmentDetail(db, userId, id, now);
  } catch (e) {
    if (e instanceof UserError) notFound();
    throw e;
  }
  const { inv, position: pos, irr, series, error } = d;
  const unitsMode = inv.valuationMode === "UNITS";
  const [movements, brokerAccounts] = await Promise.all([
    linkableMovements(db, userId, inv.accountId),
    db.account.findMany({ where: { userId, archived: false, type: "BROKER" }, select: { id: true, name: true } }),
  ]);
  const shortMonth = (m: string) => {
    const [name, y] = monthLabel(m).split(" ");
    return `${name!.slice(0, 3)} ${y!.slice(2)}`;
  };

  return (
    <>
      <PageHeader
        title={inv.name}
        description={[ASSET_TYPE_LABELS[inv.assetType], inv.isin, inv.platform, inv.account?.name].filter(Boolean).join(" · ")}
      />

      {error && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-negative/20 bg-negative/5 px-3 py-2 text-sm text-negative">
          <AlertTriangle className="size-4" /> Operaciones incoherentes: {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Valor actual"
          value={pos?.value != null ? <Money cents={pos.value} neutral /> : <PendingData reason="Añade el valor liquidativo." />}
          breakdown={
            pos?.valuation && (
              <>
                {unitsMode && <BreakdownRow label="Participaciones" value={formatDecimal(pos.units)} />}
                {pos.valuation.price && <BreakdownRow label="× Valor liquidativo" value={formatDecimal(pos.valuation.price, 6)} />}
                <BreakdownRow
                  label="Fecha del dato"
                  value={`${formatDateES(pos.valuation.date)}${pos.valuation.source === "TRANSACTION" ? " (precio de la última operación)" : ""}`}
                  muted
                />
              </>
            )
          }
        >
          {pos?.valuation && (
            <p className={`text-xs ${pos.stale ? "text-warning" : "text-muted"}`}>
              {pos.stale ? "Desactualizado: " : ""}valorado el {formatDateES(pos.valuation.date)}
            </p>
          )}
        </Kpi>
        <Kpi
          title="Capital aportado"
          value={<Money cents={pos?.contributed ?? 0} neutral />}
          breakdown={
            pos && (
              <>
                <BreakdownRow label="Aportado (compras + comisiones)" value={formatMoney(pos.contributed)} />
                <BreakdownRow label="de ello, comisiones" value={formatMoney(pos.feesPaid)} muted />
                <BreakdownRow label="Retirado (ventas + dividendos)" value={formatMoney(pos.withdrawn)} />
              </>
            )
          }
        >
          {pos?.averagePrice && <p className="text-xs text-muted">Precio medio: {formatDecimal(pos.averagePrice, 4)}</p>}
        </Kpi>
        <Kpi
          title="Ganancia / pérdida"
          value={<Gain cents={pos?.totalGain ?? null} />}
          breakdown={
            pos?.totalGain != null && (
              <>
                <BreakdownRow label="Valor actual" value={formatMoney(pos.value!)} />
                <BreakdownRow label="+ Retirado" value={formatMoney(pos.withdrawn)} />
                <BreakdownRow label="− Aportado" value={formatMoney(-pos.contributed)} />
                <BreakdownRow label={<strong>= Ganancia total</strong>} value={<strong>{formatMoney(pos.totalGain)}</strong>} />
                {pos.realizedGain !== 0 && <BreakdownRow label="de ella, realizada" value={formatMoney(pos.realizedGain)} muted />}
                {pos.unrealizedGain !== null && <BreakdownRow label="latente (valor − coste de lo vivo)" value={formatMoney(pos.unrealizedGain)} muted />}
              </>
            )
          }
        >
          <p className="text-xs text-muted">
            Rentabilidad simple: <span className="font-medium text-ink">{formatPercent(pos?.simpleReturn ?? null, { signed: true })}</span>
          </p>
        </Kpi>
        <Kpi title="Rentabilidad anual (TIR)" value={<Irr irr={irr} since={pos?.firstDate ?? null} asOf={now} />}>
          <p className="text-xs text-muted">Ponderada por el importe y la fecha de cada aportación.</p>
          {pos?.firstDate && daysBetween(pos.firstDate, now) < 365 && (
            <p className="text-xs text-warning">&lt;1a: menos de un año de historia; la cifra anualizada exagera. Mira la rentabilidad simple.</p>
          )}
        </Kpi>
      </div>

      {series.length > 1 && (
        <Card className="mt-6">
          <h2 className="mb-3 text-base font-semibold">Valor frente a capital aportado</h2>
          <LineChart
            ariaLabel={`Evolución de ${inv.name}`}
            labels={series.map((s) => shortMonth(s.month))}
            series={[
              { key: "value", label: "Valor", color: "#2a78d6", values: series.map((s) => s.value) },
              { key: "contrib", label: "Aportado", color: "#eb6834", values: series.map((s) => s.contributedCumulative), dashed: true },
            ]}
          />
        </Card>
      )}

      <Card className="mt-6">
        <h2 className="mb-1 text-base font-semibold">Operaciones</h2>
        <p className="mb-4 text-sm text-muted">Cada aportación con su fecha. Para inversiones que ya tenías, registra las aportaciones pasadas.</p>
        <OperationForm
          action={addOperationAction.bind(null, inv.id)}
          unitsMode={unitsMode}
          today={toISODate(now)}
          movements={movements.map((m) => ({ id: m.id, label: `${formatDateES(m.date)} · ${m.account.name} · ${m.descriptionClean} · ${formatMoney(m.amount)}` }))}
        />
        {inv.transactions.length > 0 && (
          <div className="mt-5">
            <Table>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Operación</Th>
                  <Th align="right">Importe</Th>
                  {unitsMode && <Th align="right" className="hidden sm:table-cell">Participaciones</Th>}
                  {unitsMode && <Th align="right" className="hidden sm:table-cell">Precio</Th>}
                  <Th className="hidden md:table-cell">Banco</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {inv.transactions.map((t) => (
                  <tr key={t.id}>
                    <Td className="whitespace-nowrap">{formatDateES(t.date)}</Td>
                    <Td>
                      <Badge tone={t.type === "BUY" ? "info" : t.type === "FEE" ? "warning" : "positive"}>{INV_TX_LABELS[t.type]}</Badge>
                      {t.notes && <div className="text-xs text-muted">{t.notes}</div>}
                    </Td>
                    <Td align="right">
                      {formatMoney(t.amount)}
                      {t.fees > 0 && <div className="text-xs text-muted">+ {formatMoney(t.fees)} comisión</div>}
                    </Td>
                    {unitsMode && <Td align="right" className="hidden tabular-nums sm:table-cell">{formatDecimal(t.units)}</Td>}
                    {unitsMode && <Td align="right" className="hidden tabular-nums sm:table-cell">{formatDecimal(t.price, 6)}</Td>}
                    <Td className="hidden md:table-cell">
                      {t.cashTransaction ? (
                        <Link href={`/movimientos/${t.cashTransaction.id}`} className="text-xs text-info hover:underline">
                          {t.cashTransaction.account.name} · {formatDateES(t.cashTransaction.date)}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </Td>
                    <Td align="right">
                      <InlineActionButton action={deleteOperationAction.bind(null, t.id)} variant="danger" confirm="¿Borrar esta operación? Si estaba vinculada a un movimiento bancario, se desvinculará.">
                        Borrar
                      </InlineActionButton>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="mb-1 text-base font-semibold">{unitsMode ? "Histórico de valor liquidativo" : "Histórico de valoraciones"}</h2>
        <p className="mb-4 text-sm text-muted">Una valoración por fecha; las anteriores se conservan para el histórico.</p>
        <PriceForm action={addPriceAction.bind(null, inv.id)} unitsMode={unitsMode} today={toISODate(now)} />
        {inv.prices.length > 0 && (
          <div className="mt-5">
            <Table>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th align="right">{unitsMode ? "VL" : "Valor total"}</Th>
                  <Th className="hidden sm:table-cell">Origen</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {inv.prices.map((p) => (
                  <tr key={p.id}>
                    <Td>{formatDateES(p.date)}</Td>
                    <Td align="right" className="tabular-nums">
                      {unitsMode ? formatDecimal(p.price, 6) : p.totalValue !== null ? formatMoney(p.totalValue) : "—"}
                    </Td>
                    <Td className="hidden text-muted sm:table-cell">{p.source === "MANUAL" ? "Manual" : p.source}</Td>
                    <Td align="right">
                      <InlineActionButton action={deletePriceAction.bind(null, p.id)} variant="danger" confirm="¿Borrar esta valoración?">
                        Borrar
                      </InlineActionButton>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="mb-4 text-base font-semibold">Editar inversión</h2>
        <InvestmentForm
          action={updateInvestmentAction.bind(null, inv.id)}
          accounts={brokerAccounts}
          submitLabel="Guardar cambios"
          lockMode={inv.transactions.length > 0}
          defaults={{
            name: inv.name,
            assetType: inv.assetType,
            isin: inv.isin,
            ticker: inv.ticker,
            platform: inv.platform,
            accountId: inv.accountId,
            currency: inv.currency,
            valuationMode: inv.valuationMode,
            notes: inv.notes,
          }}
        />
      </Card>

      <Card className="mt-6">
        <p className="mb-3 text-sm text-muted">Archivar la excluye de la cartera y del patrimonio conservando su historial. Solo se borran inversiones sin datos.</p>
        <div className="flex flex-wrap gap-2">
          <InlineActionButton action={archiveInvestmentAction.bind(null, inv.id)} hidden={{ archived: String(!inv.archived) }}>
            {inv.archived ? "Reactivar" : "Archivar"}
          </InlineActionButton>
          <InlineActionButton action={deleteInvestmentAction.bind(null, inv.id)} variant="danger" confirm="¿Borrar esta inversión?">
            Borrar
          </InlineActionButton>
        </div>
      </Card>
    </>
  );
}
