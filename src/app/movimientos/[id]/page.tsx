import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CategorySelect } from "@/components/ui/CategorySelect";
import { InlineActionButton } from "@/components/ui/InlineActionButton";
import { KindBadge } from "@/components/ui/KindBadge";
import { Money } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDateES, toISODate } from "@/domain/dates";
import { centsToInput, formatMoney } from "@/domain/money";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { listCategoryTree } from "@/server/services/categories";
import { UserError } from "@/server/services/common";
import { getTransaction, getTransferCandidates } from "@/server/services/transactions";
import { deleteTransactionAction, linkTransferAction, unlinkTransferAction, updateTransactionAction } from "../actions";
import { EditTransactionForm } from "./EditTransactionForm";

export const metadata: Metadata = { title: "Movimiento" };

const SOURCE = { MANUAL: "Manual", RULE: "Regla automática", IMPORT: "Del fichero", NONE: "Sin categorizar" } as const;
const ACTION = { create: "Creado", update: "Editado", delete: "Borrado", link: "Vinculado", unlink: "Desvinculado" } as Record<string, string>;

/** Campos que se muestran en el historial de cambios. */
const TRACKED: Array<[string, string]> = [
  ["date", "Fecha"],
  ["amount", "Importe"],
  ["descriptionRaw", "Descripción original"],
  ["descriptionClean", "Descripción"],
  ["categoryId", "Categoría"],
  ["subcategoryId", "Subcategoría"],
  ["kind", "Tipo"],
  ["merchant", "Comercio"],
  ["notes", "Notas"],
  ["transferPeerId", "Transferencia"],
  ["reviewed", "Revisado"],
  ["isExtraordinary", "Extraordinario"],
];

function diff(before: string | null, after: string | null): string[] {
  if (!before || !after) return [];
  const b = JSON.parse(before) as Record<string, unknown>;
  const a = JSON.parse(after) as Record<string, unknown>;
  return TRACKED.filter(([k]) => JSON.stringify(b[k]) !== JSON.stringify(a[k])).map(([k, label]) =>
    k === "amount" ? `${label}: ${formatMoney(Number(b[k]))} → ${formatMoney(Number(a[k]))}` : label,
  );
}

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  let data;
  try {
    data = await getTransaction(db, userId, id);
  } catch (e) {
    if (e instanceof UserError) notFound();
    throw e;
  }
  const { tx, audit } = data;
  const [categories, candidates] = await Promise.all([listCategoryTree(db, userId), getTransferCandidates(db, userId, id)]);
  const editableBankData = tx.source === "MANUAL";

  return (
    <>
      <PageHeader title={tx.descriptionClean} description={`${tx.account.name} · ${formatDateES(tx.date)}`} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Money cents={tx.amount} currency={tx.currency} neutral={tx.kind === "TRANSFER"} className="text-2xl font-semibold" />
            <div className="flex flex-wrap gap-1">
              <KindBadge kind={tx.kind} />
              {tx.isExtraordinary && <Badge tone="warning">Extraordinario</Badge>}
              {tx.reviewed ? <Badge tone="positive">Revisado</Badge> : <Badge>Sin revisar</Badge>}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Descripción original (banco)</dt>
              <dd className="break-words font-mono text-xs">{tx.descriptionRaw}</dd>
            </div>
            <div>
              <dt className="text-muted">Categoría</dt>
              <dd>
                {tx.category ? `${tx.category.name}${tx.subcategory ? ` / ${tx.subcategory.name}` : ""}` : <span className="text-warning">Sin categoría</span>}
                <span className="text-xs text-muted"> · {SOURCE[tx.categorizationSource]}{tx.rule ? ` («${tx.rule.pattern}»)` : ""}</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted">Origen</dt>
              <dd>
                {tx.source === "MANUAL"
                  ? "Alta manual"
                  : tx.import
                    ? <>Importado de <Link className="text-info hover:underline" href={`/movimientos?importacion=${tx.import.id}`}>{tx.import.fileName}</Link> (fila {(tx.importRowIndex ?? 0) + 1})</>
                    : "Importado"}
              </dd>
            </div>
            {tx.balanceAfter !== null && (
              <div>
                <dt className="text-muted">Saldo tras la operación (banco)</dt>
                <dd><Money cents={tx.balanceAfter} neutral /></dd>
              </div>
            )}
          </dl>
          {!editableBankData && (
            <p className="mt-4 text-xs text-muted">
              Fecha, importe y descripción original vienen del extracto del banco y no se modifican. Puedes cambiar categoría, descripción visible y notas.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="text-base font-semibold">Transferencia interna</h2>
          {tx.transferPeer ? (
            <div className="mt-3 text-sm">
              <p>
                Vinculada con{" "}
                <Link href={`/movimientos/${tx.transferPeer.id}`} className="font-medium text-info hover:underline">
                  {tx.transferPeer.descriptionClean}
                </Link>{" "}
                en <strong>{tx.transferPeer.account.name}</strong> ({formatDateES(tx.transferPeer.date)},{" "}
                <Money cents={tx.transferPeer.amount} neutral />).
              </p>
              <p className="mt-2 text-xs text-muted">No cuenta como ingreso, gasto ni ahorro.</p>
              <div className="mt-3">
                <InlineActionButton action={unlinkTransferAction.bind(null, tx.id)} confirm="¿Desvincular ambos movimientos?">
                  Desvincular
                </InlineActionButton>
              </div>
            </div>
          ) : candidates.length > 0 ? (
            <div className="mt-3 flex flex-col gap-3 text-sm">
              <p className="text-muted">Posibles contrapartidas en otras cuentas (importe opuesto, ±5 días):</p>
              {candidates.map((c) => (
                <div key={c.id} className="rounded-lg border border-border p-2">
                  <p className="font-medium">{c.descriptionClean}</p>
                  <p className="text-xs text-muted">
                    {c.account.name} · {formatDateES(c.date)} · <Money cents={c.amount} neutral />
                  </p>
                  <div className="mt-2">
                    <InlineActionButton action={linkTransferAction.bind(null, tx.id)} hidden={{ peerId: c.id }} variant="primary">
                      Vincular como transferencia
                    </InlineActionButton>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              No hay movimientos en otras cuentas con importe opuesto ({formatMoney(-tx.amount)}) en ±5 días.
            </p>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-4 text-base font-semibold">Editar</h2>
        <EditTransactionForm
          action={updateTransactionAction.bind(null, tx.id)}
          editableBankData={editableBankData}
          categorySelect={
            <CategorySelect
              name="category"
              categories={categories}
              defaultValue={tx.categoryId ? `${tx.categoryId}|${tx.subcategoryId ?? ""}` : ""}
            />
          }
          defaults={{
            descriptionClean: tx.descriptionClean,
            descriptionRaw: tx.descriptionRaw,
            merchant: tx.merchant,
            notes: tx.notes,
            kind: tx.kind,
            isExtraordinary: tx.isExtraordinary,
            reviewed: tx.reviewed,
            date: toISODate(tx.date),
            amountAbs: centsToInput(Math.abs(tx.amount)),
            direction: tx.amount >= 0 ? "in" : "out",
          }}
        />
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-semibold">Historial de cambios</h2>
        {audit.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Sin cambios registrados.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {audit.map((a) => {
              const changes = diff(a.before, a.after);
              return (
                <li key={a.id} className="flex flex-wrap gap-x-2">
                  <span className="text-muted">{a.createdAt.toLocaleString("es-ES")}</span>
                  <span className="font-medium">{ACTION[a.action] ?? a.action}</span>
                  {changes.length > 0 && <span className="text-muted">{changes.join(" · ")}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-semibold">Eliminar</h2>
        <p className="mb-3 mt-1 text-sm text-muted">
          {tx.source === "IMPORT"
            ? "Si lo eliminas y vuelves a importar el mismo extracto, volverá a aparecer."
            : "El borrado queda registrado en el historial de auditoría."}
        </p>
        <InlineActionButton action={deleteTransactionAction.bind(null, tx.id)} variant="danger" confirm="¿Eliminar este movimiento?">
          Eliminar movimiento
        </InlineActionButton>
      </Card>
    </>
  );
}
