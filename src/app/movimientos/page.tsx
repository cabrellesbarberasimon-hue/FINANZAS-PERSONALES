import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CategorySelect } from "@/components/ui/CategorySelect";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { KindBadge } from "@/components/ui/KindBadge";
import { Money } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th } from "@/components/ui/Table";
import { formatDateES } from "@/domain/dates";
import { TX_KIND_LABELS, TX_KINDS } from "@/domain/transactions";
import { movementHref, parseMovementSearch } from "@/lib/transaction-filters";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { listCategoryTree } from "@/server/services/categories";
import { listTransactions } from "@/server/services/transactions";

export const metadata: Metadata = { title: "Movimientos" };

function Stat({ label, children, href }: { label: string; children: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <div className="text-base font-semibold">{children}</div>
    </>
  );
  return href ? (
    <Link href={href} className="rounded-lg px-2 py-1 hover:bg-canvas">
      {body}
    </Link>
  ) : (
    <div className="px-2 py-1">{body}</div>
  );
}

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { filters, page, raw } = parseMovementSearch(await searchParams);
  const userId = await getCurrentUserId();
  const [result, accounts, categories] = await Promise.all([
    listTransactions(db, userId, filters, page),
    db.account.findMany({ where: { userId }, select: { id: true, name: true, archived: true }, orderBy: { name: "asc" } }),
    listCategoryTree(db, userId),
  ]);
  const { rows, total, pageCount, summary, net } = result;
  const hasFilters = Object.keys(raw).some((k) => k !== "pagina");
  const categoryValue = raw.categoria?.includes("|") ? raw.categoria : raw.categoria ? `${raw.categoria}|` : undefined;

  return (
    <>
      <PageHeader
        title="Movimientos"
        description="Todas tus operaciones. Pulsa una para ver su detalle, editarla o vincular una transferencia."
        actions={
          <Link href="/movimientos/nuevo" className={buttonClass()}>
            <Plus className="size-4" /> Movimiento
          </Link>
        }
      />

      <Card className="mb-4">
        <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <input name="q" defaultValue={raw.q} placeholder="Buscar texto…" className={`${inputClass} col-span-2`} aria-label="Buscar" />
          <input name="mes" type="month" defaultValue={raw.mes} className={inputClass} aria-label="Mes" />
          <input name="anio" inputMode="numeric" defaultValue={raw.anio} placeholder="Año" className={inputClass} aria-label="Año" />
          <select name="cuenta" defaultValue={raw.cuenta ?? ""} className={inputClass} aria-label="Cuenta">
            <option value="">Todas las cuentas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.archived ? " (archivada)" : ""}
              </option>
            ))}
          </select>
          <select name="tipo" defaultValue={raw.tipo ?? ""} className={inputClass} aria-label="Tipo">
            <option value="">Todos los tipos</option>
            {TX_KINDS.map((k) => (
              <option key={k} value={k}>
                {TX_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <div className="col-span-2">
            <CategorySelect name="categoria" categories={categories} defaultValue={categoryValue} emptyLabel="Todas las categorías" allowNoneFilter />
          </div>
          <input name="desde" type="date" defaultValue={raw.desde} className={inputClass} aria-label="Desde" title="Desde" />
          <input name="hasta" type="date" defaultValue={raw.hasta} className={inputClass} aria-label="Hasta" title="Hasta" />
          <input name="min" inputMode="decimal" defaultValue={raw.min} placeholder="Importe mín." className={inputClass} aria-label="Importe mínimo" />
          <input name="max" inputMode="decimal" defaultValue={raw.max} placeholder="Importe máx." className={inputClass} aria-label="Importe máximo" />
          <div className="col-span-2 flex gap-2 md:col-span-4 lg:col-span-6">
            <button type="submit" className={buttonClass()}>
              Filtrar
            </button>
            {hasFilters && (
              <Link href="/movimientos" className={buttonClass("secondary")}>
                Limpiar
              </Link>
            )}
          </div>
        </form>
      </Card>

      <Card className="mb-4">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Stat label="Movimientos">{total}</Stat>
          <Stat label="Ingresos" href={movementHref({ ...raw, tipo: "INCOME", pagina: undefined })}>
            <Money cents={summary.income.total} />
          </Stat>
          <Stat label="Gastos" href={movementHref({ ...raw, tipo: "EXPENSE", pagina: undefined })}>
            <Money cents={-summary.expenses.total} />
          </Stat>
          <Stat label="Aportado a inversión" href={movementHref({ ...raw, tipo: "INVESTMENT", pagina: undefined })}>
            <Money cents={summary.investedNet.total} neutral />
          </Stat>
          <Stat label="Transferencias internas (excluidas)" href={movementHref({ ...raw, tipo: "TRANSFER", pagina: undefined })}>
            {summary.excluded.transactionIds.length}
          </Stat>
          <Stat label="Neto del filtro">
            <Money cents={net} />
          </Stat>
        </div>
      </Card>

      <Card className="p-0 sm:p-0">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">
            {hasFilters ? "Ningún movimiento coincide con los filtros." : "Aún no hay movimientos. Crea uno o importa un extracto (fase 3)."}
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Descripción</Th>
                <Th className="hidden md:table-cell">Categoría</Th>
                <Th className="hidden lg:table-cell">Cuenta</Th>
                <Th className="hidden sm:table-cell">Tipo</Th>
                <Th align="right">Importe</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-canvas/60">
                  <Td className="whitespace-nowrap text-muted">{formatDateES(t.date)}</Td>
                  <Td>
                    <Link href={`/movimientos/${t.id}`} className="font-medium hover:underline">
                      {t.descriptionClean}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
                      <span className="md:hidden">{t.category ? `${t.category.name}${t.subcategory ? ` / ${t.subcategory.name}` : ""}` : "Sin categoría"} ·</span>
                      <span className="lg:hidden">{t.account.name}</span>
                      {t.transferPeerId && <Badge tone="info">Vinculada</Badge>}
                      {t.isExtraordinary && <Badge tone="warning">Extraordinario</Badge>}
                      {!t.reviewed && <Badge>Sin revisar</Badge>}
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    {t.category ? (
                      <span>
                        {t.category.name}
                        {t.subcategory && <span className="text-muted"> / {t.subcategory.name}</span>}
                      </span>
                    ) : (
                      <span className="text-warning">Sin categoría</span>
                    )}
                  </Td>
                  <Td className="hidden text-muted lg:table-cell">{t.account.name}</Td>
                  <Td className="hidden sm:table-cell">
                    <KindBadge kind={t.kind} />
                  </Td>
                  <Td align="right">
                    <Money cents={t.amount} currency={t.currency} neutral={t.kind === "TRANSFER"} className="font-medium" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Paginación">
          {page > 1 ? (
            <Link className={buttonClass("secondary")} href={movementHref({ ...raw, pagina: String(page - 1) })}>
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Página {page} de {pageCount}
          </span>
          {page < pageCount ? (
            <Link className={buttonClass("secondary")} href={movementHref({ ...raw, pagina: String(page + 1) })}>
              Siguiente
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
