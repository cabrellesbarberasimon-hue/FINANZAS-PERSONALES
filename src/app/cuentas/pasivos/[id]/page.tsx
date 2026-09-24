import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { InlineActionButton } from "@/components/ui/InlineActionButton";
import { Money } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { PendingData } from "@/components/ui/PendingData";
import { Table, Td, Th } from "@/components/ui/Table";
import { formatDateES, toISODate, today } from "@/domain/dates";
import { centsToInput } from "@/domain/money";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { UserError } from "@/server/services/common";
import { getLiability, LIABILITY_TYPE_LABELS } from "@/server/services/liabilities";
import {
  addLiabilityBalanceAction,
  archiveLiabilityAction,
  deleteLiabilityBalanceAction,
  updateLiabilityAction,
} from "../../actions";
import { BalanceForm } from "../../BalanceForm";
import { LiabilityForm } from "../LiabilityForm";

export const metadata: Metadata = { title: "Deuda" };

export default async function LiabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  let l;
  try {
    l = await getLiability(db, userId, id);
  } catch (e) {
    if (e instanceof UserError) notFound();
    throw e;
  }
  const accounts = await db.account.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const current = l.balances[0];
  const opt = (v: number | null) => (v === null ? undefined : centsToInput(v));

  return (
    <>
      <PageHeader title={l.name} description={[LIABILITY_TYPE_LABELS[l.type], l.lender].filter(Boolean).join(" · ")} />

      <Card>
        <p className="text-sm text-muted">Deuda pendiente</p>
        {current ? (
          <>
            <Money cents={-current.balance} neutral className="mt-1 block text-2xl font-semibold text-negative" />
            <p className="text-xs text-muted">a {formatDateES(current.date)}</p>
          </>
        ) : (
          <div className="mt-1">
            <PendingData />
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-semibold">Histórico de deuda pendiente</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Registra lo que queda por pagar según el cuadro de amortización o el banco.</p>
        <BalanceForm
          action={addLiabilityBalanceAction.bind(null, l.id)}
          defaultDate={toISODate(today())}
          balanceLabel="Pendiente (€)"
          submitLabel="Registrar"
        />
        {l.balances.length > 0 && (
          <div className="mt-4">
            <Table>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th align="right">Pendiente</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {l.balances.map((b) => (
                  <tr key={b.id}>
                    <Td>
                      {formatDateES(b.date)}
                      {b.notes && <div className="text-xs text-muted">{b.notes}</div>}
                    </Td>
                    <Td align="right">
                      <Money cents={b.balance} neutral />
                    </Td>
                    <Td align="right">
                      <InlineActionButton action={deleteLiabilityBalanceAction.bind(null, b.id)} variant="danger" confirm="¿Borrar este saldo?">
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
        <h2 className="mb-4 text-base font-semibold">Editar deuda</h2>
        <LiabilityForm
          action={updateLiabilityAction.bind(null, l.id)}
          accounts={accounts}
          submitLabel="Guardar cambios"
          today={toISODate(today())}
          defaults={{
            name: l.name,
            type: l.type,
            lender: l.lender,
            originalAmount: opt(l.originalAmount),
            interestRate: l.interestRate?.toString().replace(".", ","),
            startDate: l.startDate ? toISODate(l.startDate) : undefined,
            endDate: l.endDate ? toISODate(l.endDate) : undefined,
            monthlyPayment: opt(l.monthlyPayment),
            paymentAccountId: l.paymentAccountId,
            notes: l.notes,
          }}
        />
      </Card>

      <Card className="mt-6">
        <InlineActionButton action={archiveLiabilityAction.bind(null, l.id)} hidden={{ archived: String(!l.archived) }}>
          {l.archived ? "Reactivar" : "Archivar (deuda saldada)"}
        </InlineActionButton>
      </Card>
    </>
  );
}
