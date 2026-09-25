import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { InlineActionButton } from "@/components/ui/InlineActionButton";
import { Money } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDateES } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { getReviewSummary, listOpenFlags } from "@/server/services/review";
import { confirmDuplicateAction, linkFromFlagAction, resolveFlagAction } from "./actions";

export const metadata: Metadata = { title: "Revisar datos" };

type Flag = Awaited<ReturnType<typeof listOpenFlags>>[number];
type FlagTx = NonNullable<Flag["transaction"]>;

function TxLine({ tx, label }: { tx: FlagTx; label?: string }) {
  return (
    <div className="text-sm">
      {label && <span className="text-xs text-muted">{label} </span>}
      <Link href={`/movimientos/${tx.id}`} className="font-medium hover:underline">
        {tx.descriptionClean}
      </Link>{" "}
      <span className="text-muted">
        · {tx.account.name} · {formatDateES(tx.date)} ·{" "}
      </span>
      <Money cents={tx.amount} />
    </div>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: number; href?: string; tone?: "warning" }) {
  const body = (
    <Card className={value > 0 && tone ? "border-warning/40" : undefined}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${value > 0 && tone ? "text-warning" : ""}`}>{value}</p>
    </Card>
  );
  return href && value > 0 ? <Link href={href}>{body}</Link> : body;
}

function Section({ title, children, count }: { title: string; children: ReactNode; count: number }) {
  if (count === 0) return null;
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">
        {title} ({count})
      </h2>
      <ul className="divide-y divide-border">{children}</ul>
    </Card>
  );
}

const dismiss = (id: string, label: string, resolution: string) => (
  <InlineActionButton action={resolveFlagAction.bind(null, id)} hidden={{ decision: "dismiss", resolution }}>
    {label}
  </InlineActionButton>
);

export default async function ReviewPage() {
  const userId = await getCurrentUserId();
  const [summary, flags] = await Promise.all([getReviewSummary(db, userId), listOpenFlags(db, userId)]);
  const of = (t: Flag["type"]) => flags.filter((f) => f.type === t);
  const duplicates = of("POSSIBLE_DUPLICATE");
  const transfers = of("POSSIBLE_TRANSFER");
  const mismatches = of("BALANCE_MISMATCH");
  const others = flags.filter((f) => !["POSSIBLE_DUPLICATE", "POSSIBLE_TRANSFER", "BALANCE_MISMATCH"].includes(f.type));

  return (
    <>
      <PageHeader title="Revisar datos" description="Lo que necesita tu atención para que las cifras sean fiables." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Sin categoría" value={summary.uncategorized} href="/movimientos?categoria=none%7C" tone="warning" />
        <Stat label="Posibles duplicados" value={duplicates.length} tone="warning" />
        <Stat label="¿Transferencias?" value={transfers.length} tone="warning" />
        <Stat label="Descuadres de saldo" value={mismatches.length} tone="warning" />
        <Stat label="Sin revisar" value={summary.unreviewed} href="/movimientos?revisado=no" />
      </div>

      {flags.length === 0 && summary.uncategorized === 0 && (
        <Card className="mt-6">
          <p className="text-sm text-positive">Todo en orden: no hay avisos pendientes.</p>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-6">
        <Section title="Posibles duplicados" count={duplicates.length}>
          {duplicates.map((f) => (
            <li key={f.id} className="flex flex-col gap-2 py-3">
              <p className="text-sm">{f.message}</p>
              {f.transaction && <TxLine tx={f.transaction} label="Nuevo:" />}
              {f.relatedTransaction && <TxLine tx={f.relatedTransaction} label="Existente:" />}
              <div className="flex flex-wrap gap-2">
                <InlineActionButton action={confirmDuplicateAction.bind(null, f.id)} variant="danger" confirm="Se eliminará el movimiento NUEVO. ¿Continuar?">
                  Es duplicado: eliminar el nuevo
                </InlineActionButton>
                {dismiss(f.id, "No es duplicado", "Operaciones distintas")}
              </div>
            </li>
          ))}
        </Section>

        <Section title="¿Transferencias internas?" count={transfers.length}>
          {transfers.map((f) => (
            <li key={f.id} className="flex flex-col gap-2 py-3">
              <p className="text-sm">{f.message}</p>
              {f.transaction && <TxLine tx={f.transaction} />}
              {f.relatedTransaction && <TxLine tx={f.relatedTransaction} label="Candidata:" />}
              <div className="flex flex-wrap gap-2">
                {f.transaction && f.relatedTransaction && (
                  <InlineActionButton action={linkFromFlagAction.bind(null, f.transaction.id, f.relatedTransaction.id)} variant="primary">
                    Vincular como transferencia
                  </InlineActionButton>
                )}
                {f.transaction && (
                  <Link href={`/movimientos/${f.transaction.id}`} className="self-center text-sm text-info hover:underline">
                    Ver todas las candidatas
                  </Link>
                )}
                {dismiss(f.id, "No es una transferencia", "No es transferencia interna")}
              </div>
            </li>
          ))}
        </Section>

        <Section title="Descuadres de saldo" count={mismatches.length}>
          {mismatches.map((f) => {
            const d = f.data ? (JSON.parse(f.data) as { difference?: number; date?: string }) : {};
            return (
              <li key={f.id} className="flex flex-col gap-2 py-3">
                <p className="text-sm">
                  {f.message}
                  {d.difference !== undefined && <strong> Diferencia: {formatMoney(d.difference, { signed: true })}.</strong>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {f.account && (
                    <Link href={`/cuentas/${f.account.id}`} className="self-center text-sm text-info hover:underline">
                      Ver conciliación de {f.account.name}
                    </Link>
                  )}
                  <InlineActionButton action={resolveFlagAction.bind(null, f.id)} hidden={{ decision: "resolve", resolution: "Revisado por el usuario" }}>
                    Ya lo he revisado
                  </InlineActionButton>
                </div>
              </li>
            );
          })}
        </Section>

        <Section title="Otros avisos" count={others.length}>
          {others.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <p className="text-sm">{f.message}</p>
              {dismiss(f.id, "Descartar", "Descartado")}
            </li>
          ))}
        </Section>
      </div>
      <p className="mt-6 text-xs text-muted">La revisión completa (inversiones sin actualizar, operaciones dudosas…) se amplía en la fase 10.</p>
    </>
  );
}
