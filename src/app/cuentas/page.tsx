import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { buttonClass } from "@/components/ui/styles";
import { Money } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { PendingData } from "@/components/ui/PendingData";
import { Table, Td, Th } from "@/components/ui/Table";
import { ACCOUNT_TYPE_LABELS, assetGroup, type AssetGroup } from "@/domain/accounts";
import { formatDateES } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { listAccounts, type AccountSummary } from "@/server/services/accounts";
import { LIABILITY_TYPE_LABELS, listLiabilities } from "@/server/services/liabilities";

export const metadata: Metadata = { title: "Cuentas" };

const GROUPS: Array<{ key: AssetGroup; title: string }> = [
  { key: "LIQUIDITY", title: "Liquidez" },
  { key: "CARD", title: "Tarjetas" },
  { key: "INVESTMENT", title: "Inversión (valor manual)" },
  { key: "OTHER_ASSET", title: "Otros activos" },
];

function ReconciliationBadge({ s }: { s: AccountSummary }) {
  if (s.method === "DECLARED") return <Badge>Valor manual</Badge>;
  if (s.lastDifference === null) return <Badge>Sin saldo del banco</Badge>;
  if (s.lastDifference === 0) return <Badge tone="positive">Cuadra</Badge>;
  return <Badge tone="warning">Descuadre {formatMoney(s.lastDifference, { signed: true })}</Badge>;
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ archivadas?: string }> }) {
  const { archivadas } = await searchParams;
  const showArchived = archivadas === "1";
  const userId = await getCurrentUserId();
  const [accounts, liabilities] = await Promise.all([
    listAccounts(db, userId, { includeArchived: showArchived }),
    listLiabilities(db, userId, { includeArchived: showArchived }),
  ]);

  return (
    <>
      <PageHeader
        title="Cuentas"
        description="Dónde está tu dinero y lo que debes."
        actions={
          <>
            <Link href="/cuentas/pasivos/nueva" className={buttonClass("secondary")}>
              <Plus className="size-4" /> Deuda
            </Link>
            <Link href="/cuentas/nueva" className={buttonClass()}>
              <Plus className="size-4" /> Cuenta
            </Link>
          </>
        }
      />

      {accounts.length === 0 && (
        <Card className="mb-6">
          <p className="text-sm text-muted">
            Aún no tienes cuentas. <Link href="/cuentas/nueva" className="font-medium text-info hover:underline">Crea la primera</Link>{" "}
            con su saldo actual y la fecha de ese saldo.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-6">
        {GROUPS.map(({ key, title }) => {
          const rows = accounts.filter((a) => assetGroup(a.account.type) === key);
          if (rows.length === 0) return null;
          const eur = rows.filter((r) => r.account.currency === "EUR" && !r.account.archived);
          const other = rows.length - eur.length;
          const subtotal = eur.reduce((s, r) => s + r.balance, 0);
          return (
            <Card key={key}>
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h2 className="text-base font-semibold">{title}</h2>
                <div className="text-right">
                  <Money cents={subtotal} neutral className={subtotal < 0 ? "font-semibold text-negative" : "font-semibold"} />
                  {other > 0 && <p className="text-xs text-muted">{other} cuenta(s) fuera del total (archivada u otra moneda)</p>}
                </div>
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>Cuenta</Th>
                    <Th className="hidden sm:table-cell">Entidad</Th>
                    <Th className="hidden md:table-cell">Tipo</Th>
                    <Th className="hidden md:table-cell">Conciliación</Th>
                    <Th align="right">Saldo</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.account.id} className="hover:bg-canvas/60">
                      <Td>
                        <Link href={`/cuentas/${s.account.id}`} className="font-medium hover:underline">
                          {s.account.name}
                        </Link>
                        {s.account.archived && <span className="ml-2"><Badge>Archivada</Badge></span>}
                        <div className="text-xs text-muted sm:hidden">{s.account.institution}</div>
                      </Td>
                      <Td className="hidden text-muted sm:table-cell">{s.account.institution ?? "—"}</Td>
                      <Td className="hidden text-muted md:table-cell">{ACCOUNT_TYPE_LABELS[s.account.type]}</Td>
                      <Td className="hidden md:table-cell">
                        <ReconciliationBadge s={s} />
                      </Td>
                      <Td align="right">
                        <Money
                          cents={s.balance}
                          currency={s.account.currency}
                          neutral
                          className={s.balance < 0 ? "font-medium text-negative" : "font-medium"}
                        />
                        <div className="text-xs text-muted">a {formatDateES(s.balanceDate)}</div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          );
        })}

        {liabilities.length > 0 && (
          <Card>
            <h2 className="mb-3 text-base font-semibold">Deudas</h2>
            <Table>
              <thead>
                <tr>
                  <Th>Deuda</Th>
                  <Th className="hidden sm:table-cell">Tipo</Th>
                  <Th className="hidden sm:table-cell">Acreedor</Th>
                  <Th align="right">Pendiente</Th>
                </tr>
              </thead>
              <tbody>
                {liabilities.map(({ liability: l, current }) => (
                  <tr key={l.id} className="hover:bg-canvas/60">
                    <Td>
                      <Link href={`/cuentas/pasivos/${l.id}`} className="font-medium hover:underline">
                        {l.name}
                      </Link>
                      {l.archived && <span className="ml-2"><Badge>Archivada</Badge></span>}
                    </Td>
                    <Td className="hidden text-muted sm:table-cell">{LIABILITY_TYPE_LABELS[l.type]}</Td>
                    <Td className="hidden text-muted sm:table-cell">{l.lender ?? "—"}</Td>
                    <Td align="right">
                      {current ? (
                        <>
                          <Money cents={-current.balance} neutral className="font-medium text-negative" />
                          <div className="text-xs text-muted">a {formatDateES(current.date)}</div>
                        </>
                      ) : (
                        <PendingData reason="Registra el saldo pendiente de esta deuda." />
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      <p className="mt-6 text-sm">
        <Link href={showArchived ? "/cuentas" : "/cuentas?archivadas=1"} className="text-info hover:underline">
          {showArchived ? "Ocultar archivadas" : "Mostrar archivadas"}
        </Link>
      </p>
    </>
  );
}
