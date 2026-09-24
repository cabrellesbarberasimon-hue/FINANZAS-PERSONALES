import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { InlineActionButton } from "@/components/ui/InlineActionButton";
import { Money } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th } from "@/components/ui/Table";
import { ACCOUNT_TYPE_LABELS } from "@/domain/accounts";
import { formatDateES, toISODate, today } from "@/domain/dates";
import { centsToInput, formatMoney } from "@/domain/money";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { getAccountDetail } from "@/server/services/accounts";
import { UserError } from "@/server/services/common";
import {
  addDeclaredBalanceAction,
  archiveAccountAction,
  deleteAccountAction,
  deleteDeclaredBalanceAction,
  updateAccountAction,
} from "../actions";
import { AccountForm } from "../AccountForm";
import { BalanceForm } from "../BalanceForm";

export const metadata: Metadata = { title: "Cuenta" };

const SOURCE_LABEL = { MANUAL: "Manual", IMPORT: "Extracto", OPENING: "Inicial" } as const;

async function load(id: string) {
  try {
    return await getAccountDetail(db, await getCurrentUserId(), id);
  } catch (e) {
    if (e instanceof UserError) notFound();
    throw e;
  }
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await load(id);
  const a = d.account;
  const computedByDate = new Map(d.reconciliation.map((r) => [toISODate(r.date), r]));
  // Orden cronológico para localizar dónde aparece cada descuadre.
  const chronological = [...d.reconciliation].reverse();

  return (
    <>
      <PageHeader
        title={a.name}
        description={[a.institution, ACCOUNT_TYPE_LABELS[a.type], a.currency].filter(Boolean).join(" · ")}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">{d.method === "DECLARED" ? "Valor actual" : "Saldo calculado"}</p>
          <Money
            cents={d.balance}
            currency={a.currency}
            neutral
            className={`mt-1 block text-2xl font-semibold ${d.balance < 0 ? "text-negative" : ""}`}
          />
          <p className="mt-1 text-xs text-muted">
            {d.method === "DECLARED"
              ? `Última valoración: ${d.balanceDate ? formatDateES(d.balanceDate) : "—"}`
              : `Saldo inicial ${formatMoney(a.openingBalance)} a ${formatDateES(a.openingDate)} + movimientos posteriores`}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Movimientos</p>
          <p className="mt-1 text-2xl font-semibold">{d.transactionCount}</p>
          <Link href={`/movimientos?cuenta=${a.id}`} className="text-sm text-info hover:underline">
            Ver movimientos de esta cuenta
          </Link>
        </Card>
        <Card>
          <p className="text-sm text-muted">Último saldo del banco</p>
          {d.method === "TRANSACTIONS" && d.reconciliation[0] ? (
            <>
              <Money cents={d.reconciliation[0].declared} neutral className="mt-1 block text-2xl font-semibold" />
              <p className="mt-1 text-xs">
                {d.reconciliation[0].difference === 0 ? (
                  <Badge tone="positive">Cuadra con la aplicación</Badge>
                ) : (
                  <Badge tone="warning">
                    Diferencia&nbsp;<Money cents={d.reconciliation[0].difference} signed neutral />
                  </Badge>
                )}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">Sin datos. Añade abajo el saldo que indica tu banco para conciliar.</p>
          )}
        </Card>
      </div>

      {d.ignoredBeforeOpening > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-info/20 bg-info/5 px-3 py-2 text-sm text-info">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {d.ignoredBeforeOpening} movimiento(s) tienen fecha igual o anterior al saldo inicial ({formatDateES(a.openingDate)}) y
          no suman al saldo: se consideran ya incluidos en él.
        </p>
      )}

      <Card className="mt-6">
        <h2 className="text-base font-semibold">{d.method === "DECLARED" ? "Valoraciones" : "Conciliación con el banco"}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          {d.method === "DECLARED"
            ? "Registra el valor de este activo en cada fecha. El histórico nunca se sobrescribe."
            : "Introduce el saldo que muestra tu banco en una fecha (al final del día) y la aplicación lo comparará con su saldo calculado."}
        </p>
        <BalanceForm
          action={addDeclaredBalanceAction.bind(null, a.id)}
          defaultDate={toISODate(today())}
          balanceLabel={d.method === "DECLARED" ? "Valor (€)" : "Saldo según banco (€)"}
          submitLabel="Registrar"
        />
        {d.balances.length > 0 && (
          <div className="mt-4">
            <Table>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th align="right">{d.method === "DECLARED" ? "Valor" : "Banco"}</Th>
                  {d.method === "TRANSACTIONS" && <Th align="right">Aplicación</Th>}
                  {d.method === "TRANSACTIONS" && <Th align="right">Diferencia</Th>}
                  <Th className="hidden sm:table-cell">Origen</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {d.balances.map((b) => {
                  const r = computedByDate.get(toISODate(b.date));
                  const idx = r ? chronological.indexOf(r) : -1;
                  const prev = idx > 0 ? chronological[idx - 1] : undefined;
                  const newDiff = r && r.difference !== 0 && (!prev || prev.difference !== r.difference);
                  return (
                    <tr key={b.id}>
                      <Td>
                        {formatDateES(b.date)}
                        {b.notes && <div className="text-xs text-muted">{b.notes}</div>}
                      </Td>
                      <Td align="right">
                        <Money cents={b.balance} neutral />
                      </Td>
                      {d.method === "TRANSACTIONS" && (
                        <Td align="right">{r ? <Money cents={r.computed} neutral /> : <span className="text-xs text-muted">Anterior al saldo inicial</span>}</Td>
                      )}
                      {d.method === "TRANSACTIONS" && (
                        <Td align="right">
                          {r &&
                            (r.difference === 0 ? (
                              <span className="text-positive">0</span>
                            ) : (
                              <>
                                <Money cents={r.difference} signed neutral className="font-medium text-warning" />
                                {newDiff && (
                                  <div>
                                    <Link
                                      className="text-xs text-info hover:underline"
                                      href={`/movimientos?cuenta=${a.id}&desde=${toISODate(
                                        new Date((prev?.date ?? a.openingDate).getTime() + 86_400_000),
                                      )}&hasta=${toISODate(b.date)}`}
                                    >
                                      Revisar movimientos del periodo
                                    </Link>
                                  </div>
                                )}
                              </>
                            ))}
                        </Td>
                      )}
                      <Td className="hidden text-muted sm:table-cell">{SOURCE_LABEL[b.source]}</Td>
                      <Td align="right">
                        {b.source === "MANUAL" && (
                          <InlineActionButton
                            action={deleteDeclaredBalanceAction.bind(null, b.id)}
                            variant="danger"
                            confirm="¿Borrar este saldo registrado?"
                          >
                            Borrar
                          </InlineActionButton>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {d.method === "TRANSACTIONS" && (
              <p className="mt-3 text-xs text-muted">
                Una diferencia que aparece entre dos fechas indica movimientos que faltan, sobran o tienen importe distinto en ese periodo.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="mb-4 text-base font-semibold">Editar cuenta</h2>
        <AccountForm
          action={updateAccountAction.bind(null, a.id)}
          submitLabel="Guardar cambios"
          defaults={{
            name: a.name,
            institution: a.institution,
            type: a.type,
            currency: a.currency,
            identifier: a.identifier,
            notes: a.notes,
            openingBalance: centsToInput(a.openingBalance),
            openingDate: toISODate(a.openingDate),
          }}
        />
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-semibold">Archivar o eliminar</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          Archivar oculta la cuenta y la excluye de los totales, pero conserva su historial. Solo se pueden eliminar cuentas sin movimientos.
        </p>
        <div className="flex flex-wrap gap-2">
          <InlineActionButton action={archiveAccountAction.bind(null, a.id)} hidden={{ archived: String(!a.archived) }}>
            {a.archived ? "Reactivar" : "Archivar"}
          </InlineActionButton>
          <InlineActionButton
            action={deleteAccountAction.bind(null, a.id)}
            variant="danger"
            confirm="¿Eliminar definitivamente esta cuenta?"
          >
            Eliminar
          </InlineActionButton>
        </div>
      </Card>
    </>
  );
}
