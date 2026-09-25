import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { BreakdownRow, Kpi } from "@/components/dashboard/Kpi";
import { Delta } from "@/components/dashboard/Delta";
import { RankedBars } from "@/components/dashboard/RankedBars";
import { Card } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { PendingData } from "@/components/ui/PendingData";
import { buttonClass } from "@/components/ui/styles";
import { addMonths, formatDateES, monthKey, monthLabel, today } from "@/domain/dates";
import { formatMoney, formatPercent } from "@/domain/money";
import { DISTRIBUTION_LABELS } from "@/domain/networth";
import { movementHref } from "@/lib/transaction-filters";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { getDashboard } from "@/server/services/dashboard";
import { getOnboarding } from "@/server/services/onboarding";

function MonthNav({ month, current }: { month: string; current: string }) {
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  return (
    <div className="flex items-center gap-1">
      <Link href={`/?mes=${prev}`} className={buttonClass("secondary")} aria-label="Mes anterior">
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-36 text-center text-sm font-medium capitalize">{monthLabel(month)}</span>
      {month < current ? (
        <Link href={`/?mes=${next}`} className={buttonClass("secondary")} aria-label="Mes siguiente">
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className={`${buttonClass("secondary")} pointer-events-none opacity-40`} aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  const now = today();
  const current = monthKey(now);
  const month = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes <= current ? mes : current;
  const userId = await getCurrentUserId();
  const [d, onboarding] = await Promise.all([getDashboard(db, userId, month, now), getOnboarding(db, userId)]);
  const nw = d.netWorth;
  const cf = d.cashflow;
  const prevMonth = addMonths(month, -1);
  const pendingNames = nw.pending.map((p) => p.name).join(", ");
  const liquidityItems = nw.items.filter((i) => i.bucket === "LIQUIDITY");
  const investmentItems = nw.items.filter((i) => i.bucket === "INVESTMENTS");

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={d.isCurrentMonth ? `Situación a hoy, ${formatDateES(d.date)}.` : `Situación a cierre de ${monthLabel(month)}.`}
        actions={<MonthNav month={month} current={current} />}
      />

      {!onboarding.finished && (
        <Card className="mb-6 border-info/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Primeros pasos</h2>
              <p className="text-sm text-muted">
                {onboarding.steps.filter((s) => s.status === "pending").length} paso(s) pendientes para tener una foto completa de tus finanzas.
              </p>
            </div>
            <Link href="/bienvenida" className={buttonClass()}>
              {onboarding.hasAccounts ? "Continuar asistente" : "Empezar"}
            </Link>
          </div>
        </Card>
      )}

      {(d.review.uncategorized > 0 || d.review.openFlags > 0) && (
        <Link href="/revision" className="mb-6 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning hover:bg-warning/10">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span>
            {d.review.uncategorized > 0 && `${d.review.uncategorized} movimiento(s) sin categoría. `}
            {d.review.openFlags > 0 && `${d.review.openFlags} aviso(s) por revisar. `}
            Las cifras son más fiables cuando están resueltos.
          </span>
        </Link>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Patrimonio neto"
          value={d.hasData ? <Money cents={nw.netWorth} neutral decimals={0} className={nw.netWorth < 0 ? "text-negative" : ""} /> : <PendingData />}
          breakdown={
            d.hasData && (
              <>
                <BreakdownRow label="Liquidez" value={formatMoney(nw.liquidity)} href="/cuentas" />
                <BreakdownRow label="Inversiones" value={formatMoney(nw.investments)} href="/cuentas" />
                <BreakdownRow label="Otros activos" value={formatMoney(nw.otherAssets)} href="/cuentas" />
                <BreakdownRow label="− Deudas" value={formatMoney(-nw.liabilities)} href="/cuentas" />
                <BreakdownRow label={<strong>= Patrimonio neto</strong>} value={<strong>{formatMoney(nw.netWorth)}</strong>} />
                {nw.pending.map((p) => (
                  <BreakdownRow key={p.id} label={`No incluido: ${p.name}`} value={<span className="text-warning">pendiente</span>} muted />
                ))}
              </>
            )
          }
        >
          {d.hasData && !nw.complete && (
            <p className="text-xs text-warning" title={nw.pending.map((p) => `${p.name}: ${p.reason}`).join("\n")}>
              Incompleto: falta {pendingNames}
            </p>
          )}
          {d.hasData && (
            <>
              <Delta
                cents={d.changeMonth.delta}
                label={d.isCurrentMonth ? "este mes" : `en ${monthLabel(month).split(" ")[0]}`}
                pendingReason={d.changeMonth.reason}
              />
              <Delta cents={d.changeYear.delta} pct={d.changeYear.pct} label="último año" pendingReason={d.changeYear.reason} />
            </>
          )}
        </Kpi>

        <Kpi
          title="Liquidez"
          value={d.hasData ? <Money cents={nw.liquidity} neutral decimals={0} /> : <PendingData />}
          breakdown={
            liquidityItems.length > 0 && (
              <>
                {liquidityItems.map((i) => (
                  <BreakdownRow
                    key={i.id}
                    label={i.value !== null && i.value < 0 ? `${i.name} (cuenta como deuda)` : i.name}
                    href={`/cuentas/${i.id}`}
                    muted={i.value !== null && i.value < 0}
                    value={i.value === null ? <span className="text-warning">pendiente</span> : formatMoney(i.value)}
                  />
                ))}
              </>
            )
          }
        >
          <p className="text-xs text-muted">Cuentas, cuentas remuneradas, efectivo y efectivo en broker.</p>
        </Kpi>

        <Kpi
          title="Inversiones"
          value={
            investmentItems.some((i) => i.value !== null) ? <Money cents={nw.investments} neutral decimals={0} /> : <PendingData reason="Aún no hay inversiones valoradas." />
          }
          breakdown={
            <>
              {investmentItems.map((i) => (
                <BreakdownRow
                  key={i.id}
                  label={i.name}
                  href={i.kind === "account" ? `/cuentas/${i.id}` : "/inversiones"}
                  value={i.value === null ? <span className="text-warning">pendiente</span> : formatMoney(i.value)}
                />
              ))}
              <p className="text-xs text-muted">
                Capital aportado, ganancia y rentabilidad llegan con el módulo de inversiones (fase 6). Hasta entonces solo se muestran cuentas de inversión
                con valor manual.
              </p>
            </>
          }
        >
          <p className="text-xs text-muted">Aportado, ganancia y rentabilidad: <span className="text-warning">pendiente (fase 6)</span></p>
        </Kpi>

        <Kpi
          title={`Ahorro de ${monthLabel(month).split(" ")[0]}`}
          value={
            cf.income.transactionIds.length + cf.expenses.transactionIds.length === 0 ? (
              <PendingData reason="No hay ingresos ni gastos este mes." />
            ) : (
              <Money cents={cf.savings} decimals={0} />
            )
          }
          breakdown={
            <>
              <BreakdownRow label="Ingresos" value={formatMoney(cf.income.total)} href={movementHref({ mes: month, tipo: "INCOME" })} />
              <BreakdownRow label="− Gastos" value={formatMoney(-cf.expenses.total)} href={movementHref({ mes: month, tipo: "EXPENSE" })} />
              <BreakdownRow label={<strong>= Ahorro</strong>} value={<strong>{formatMoney(cf.savings)}</strong>} />
              <BreakdownRow label="Tasa = ahorro / ingresos × 100" value={formatPercent(cf.savingsRate)} muted />
              <BreakdownRow
                label={`Excluidas: ${cf.excluded.transactionIds.length} transferencias internas`}
                value=""
                href={movementHref({ mes: month, tipo: "TRANSFER" })}
                muted
              />
            </>
          }
        >
          <p className="text-xs text-muted">
            Tasa de ahorro: <span className="font-medium text-ink">{formatPercent(cf.savingsRate)}</span>
          </p>
          <Delta
            cents={d.previousCashflow.income.transactionIds.length ? cf.savings - d.previousCashflow.savings : null}
            label={`vs ${monthLabel(prevMonth).split(" ")[0]}`}
            pendingReason="Sin movimientos el mes anterior."
          />
        </Kpi>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Ingresos y gastos del mes */}
        <Card>
          <h2 className="text-base font-semibold">Ingresos y gastos</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted">Ingresos</dt>
              <dd>
                <Link href={movementHref({ mes: month, tipo: "INCOME" })} className="text-xl font-semibold text-positive hover:underline">
                  {formatMoney(cf.income.total, { decimals: 0 })}
                </Link>
              </dd>
              <Delta
                cents={d.previousCashflow.income.transactionIds.length ? cf.income.total - d.previousCashflow.income.total : null}
                label="vs mes anterior"
              />
            </div>
            <div>
              <dt className="text-muted">Gastos</dt>
              <dd>
                <Link href={movementHref({ mes: month, tipo: "EXPENSE" })} className="text-xl font-semibold text-negative hover:underline">
                  {formatMoney(-cf.expenses.total, { decimals: 0 })}
                </Link>
              </dd>
              <Delta
                cents={d.previousCashflow.expenses.transactionIds.length ? cf.expenses.total - d.previousCashflow.expenses.total : null}
                label="vs mes anterior"
                goodWhen="down"
              />
            </div>
            <div>
              <dt className="text-muted">Aportado a inversión</dt>
              <dd>
                <Link href={movementHref({ mes: month, tipo: "INVESTMENT" })} className="text-lg font-semibold hover:underline">
                  {formatMoney(cf.investedNet.total, { decimals: 0 })}
                </Link>
              </dd>
              <p className="text-xs text-muted">No es gasto: sale de liquidez y entra en inversión.</p>
            </div>
            <div>
              <dt className="text-muted">Tasa de ahorro</dt>
              <dd className="text-lg font-semibold">{formatPercent(cf.savingsRate)}</dd>
            </div>
          </dl>

          <h3 className="mb-2 mt-6 text-sm font-medium text-muted">Mayores gastos por categoría</h3>
          {d.topExpenses.length === 0 ? (
            <p className="text-sm text-muted">Sin gastos este mes.</p>
          ) : (
            <RankedBars
              ariaLabel="Gastos por categoría"
              total={cf.expenses.total}
              rows={d.topExpenses.map((c) => ({
                key: c.categoryId ?? "none",
                label: c.name,
                value: c.total,
                hint: `${c.count} movimientos`,
                href: movementHref({ mes: month, tipo: "EXPENSE", categoria: c.categoryId ? `${c.categoryId}|` : "none|" }),
              }))}
            />
          )}
        </Card>

        {/* Distribución del patrimonio */}
        <Card>
          <h2 className="text-base font-semibold">Distribución del patrimonio</h2>
          <p className="mb-3 mt-1 text-sm text-muted">
            Activos: {formatMoney(nw.assets, { decimals: 0 })}
            {nw.liabilities > 0 && ` · Deudas: ${formatMoney(nw.liabilities, { decimals: 0 })}`}
          </p>
          {nw.distribution.length === 0 ? (
            <PendingData reason="Registra tus cuentas para ver la distribución." />
          ) : (
            <RankedBars
              ariaLabel="Distribución del patrimonio"
              total={nw.assets}
              rows={nw.distribution.map((g) => ({
                key: g.group,
                label: DISTRIBUTION_LABELS[g.group],
                value: g.value,
                share: g.share,
                hint: nw.items.filter((i) => g.itemIds.includes(i.id)).map((i) => i.name).join(", "),
                href: "/cuentas",
              }))}
            />
          )}
          {nw.pending.length > 0 && (
            <p className="mt-3 text-xs text-warning">
              No incluido por falta de datos: {nw.pending.map((p) => `${p.name} (${p.reason})`).join("; ")}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
