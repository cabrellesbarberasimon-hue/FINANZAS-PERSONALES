import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { IMPORT_STATUS } from "@/components/ui/importStatus";
import { InlineActionButton } from "@/components/ui/InlineActionButton";
import { Money } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClass } from "@/components/ui/styles";
import { Table, Td, Th } from "@/components/ui/Table";
import { formatDateES, today } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import type { Cell } from "@/server/import/types";
import { UserError } from "@/server/services/common";
import { buildPreview, getImport, getMappingStep } from "@/server/services/imports";
import { commitImportAction, discardImportAction, editMappingAction, revertImportAction, saveMappingAction } from "../actions";
import { CommitForm } from "./CommitForm";
import { columnLetter } from "@/lib/columns";
import { MappingForm } from "./MappingForm";

export const metadata: Metadata = { title: "Importación" };

function cellText(c: Cell | undefined): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return formatDateES(c);
  return String(c);
}

function Notice({ tone, children }: { tone: "info" | "warning" | "positive"; children: ReactNode }) {
  const Icon = tone === "positive" ? CheckCircle2 : tone === "warning" ? AlertTriangle : Info;
  const cls = {
    info: "border-info/20 bg-info/5 text-info",
    warning: "border-warning/30 bg-warning/5 text-warning",
    positive: "border-positive/20 bg-positive/5 text-positive",
  }[tone];
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${cls}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

const STEPS = ["Fichero", "Columnas", "Revisión", "Importado"];

function Stepper({ current }: { current: number }) {
  return (
    <ol className="mb-6 flex flex-wrap gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li
          key={s}
          className={`rounded-full border px-3 py-1 ${i === current ? "border-info bg-info/10 font-medium text-info" : i < current ? "border-border text-muted" : "border-border text-muted/60"}`}
        >
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}

export default async function ImportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ repetido?: string }>;
}) {
  const { id } = await params;
  const { repetido } = await searchParams;
  const userId = await getCurrentUserId();
  let imp;
  try {
    imp = await getImport(db, userId, id);
  } catch (e) {
    if (e instanceof UserError) notFound();
    throw e;
  }
  const config = JSON.parse(imp.mapping).config as { confirmed: boolean };
  const title = `${imp.fileName}`;
  const description = `${imp.account.name} · ${imp.fileType.toUpperCase()} · ${(imp.fileSize / 1024).toFixed(0)} KB`;

  // ---------------------------------------------------------------- Importado / deshecho
  if (imp.status !== "PREVIEW") {
    const flags = await db.reviewFlag.findMany({ where: { importId: id, status: "OPEN" } });
    const mismatch = flags.find((f) => f.type === "BALANCE_MISMATCH");
    const mismatchData = mismatch?.data ? (JSON.parse(mismatch.data) as { difference: number }) : null;
    return (
      <>
        <PageHeader title={title} description={description} />
        <Stepper current={3} />
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={IMPORT_STATUS[imp.status]?.tone}>{IMPORT_STATUS[imp.status]?.label}</Badge>
            {imp.committedAt && <span className="text-sm text-muted">el {imp.committedAt.toLocaleString("es-ES")}</span>}
            {imp.profile && <span className="text-sm text-muted">· formato «{imp.profile.name}»</span>}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted">Operaciones detectadas</dt>
              <dd className="text-xl font-semibold">{imp.rowsTotal}</dd>
            </div>
            <div>
              <dt className="text-muted">Nuevas importadas</dt>
              <dd className="text-xl font-semibold text-positive">{imp.rowsNew}</dd>
            </div>
            <div>
              <dt className="text-muted">Ya existían</dt>
              <dd className="text-xl font-semibold">{imp.rowsDuplicate}</dd>
            </div>
            <div>
              <dt className="text-muted">Descartadas / no válidas</dt>
              <dd className="text-xl font-semibold">{imp.rowsSkipped}</dd>
            </div>
          </dl>
          {imp.rowsFlagged > 0 && (
            <div className="mt-4">
              <Notice tone="warning">
                {imp.rowsFlagged} operación(es) importadas como <strong>posible duplicado</strong>: revísalas en{" "}
                <Link className="underline" href="/revision">Revisión</Link>.
              </Notice>
            </div>
          )}
          {imp.statementBalance !== null && imp.statementBalanceDate && (
            <div className="mt-4">
              {mismatchData ? (
                <Notice tone="warning">
                  Saldo del banco a {formatDateES(imp.statementBalanceDate)}: <strong>{formatMoney(imp.statementBalance)}</strong>. Diferencia con
                  la aplicación: <strong>{formatMoney(mismatchData.difference, { signed: true })}</strong>.{" "}
                  <Link className="underline" href={`/cuentas/${imp.accountId}`}>Ver conciliación</Link>
                </Notice>
              ) : (
                imp.status === "COMMITTED" && (
                  <Notice tone="positive">
                    El saldo del extracto a {formatDateES(imp.statementBalanceDate)} ({formatMoney(imp.statementBalance)}) coincide con el calculado.
                  </Notice>
                )
              )}
            </div>
          )}
          {imp.status === "COMMITTED" && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/movimientos?importacion=${imp.id}`} className={buttonClass()}>
                Ver los movimientos importados
              </Link>
              <Link href="/movimientos?categoria=none%7C" className={buttonClass("secondary")}>
                Sin categoría
              </Link>
              <InlineActionButton
                action={revertImportAction.bind(null, imp.id)}
                variant="danger"
                confirm="Se eliminarán todos los movimientos de esta importación (incluidas las ediciones que hayas hecho en ellos). ¿Continuar?"
              >
                Deshacer importación
              </InlineActionButton>
            </div>
          )}
        </Card>
      </>
    );
  }

  // ---------------------------------------------------------------- Paso de mapeo
  if (!config.confirmed) {
    const step = await getMappingStep(db, userId, id);
    const { table, headers } = step;
    const headerRowOptions = table.rows.slice(0, 40).map((r, i) => ({
      index: i,
      label: r.map(cellText).filter(Boolean).join(" · ").slice(0, 70) || "(vacía)",
    }));
    const sample = table.rows.slice(step.config.headerRow + 1).filter((r) => r.some((c) => c !== null)).slice(0, 8);
    return (
      <>
        <PageHeader title={title} description={description} />
        <Stepper current={1} />
        {repetido && (
          <div className="mb-4">
            <Notice tone="warning">
              Este mismo fichero ya se importó antes. Puedes continuar: las operaciones que ya existen se detectarán y no se duplicarán.
            </Notice>
          </div>
        )}
        {imp.profile && (
          <div className="mb-4">
            <Notice tone="info">Formato reconocido: «{imp.profile.name}». Revisa y continúa.</Notice>
          </div>
        )}
        <Card>
          <h2 className="mb-1 text-base font-semibold">¿Qué contiene cada columna?</h2>
          <p className="mb-4 text-sm text-muted">Se ha propuesto una asignación automática. Compruébala con la muestra de abajo.</p>
          <MappingForm
            action={saveMappingAction.bind(null, id)}
            config={step.config}
            headers={headers}
            headerRowOptions={headerRowOptions}
            dateAmbiguous={step.dateAmbiguous}
          />
        </Card>
        <Card className="mt-6">
          <h2 className="mb-3 text-base font-semibold">Muestra del fichero</h2>
          <Table>
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <Th key={i}>
                    {columnLetter(i)} · {h}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.map((r, ri) => (
                <tr key={ri}>
                  {headers.map((_, ci) => (
                    <Td key={ci} className="whitespace-nowrap font-mono text-xs">
                      {cellText(r[ci])}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-muted">
            Lectura: {Object.entries(table.meta).map(([k, v]) => `${k}=${v}`).join(", ")}
          </p>
        </Card>
        <div className="mt-6">
          <InlineActionButton action={discardImportAction.bind(null, id)} variant="danger" confirm="¿Descartar esta importación?">
            Descartar
          </InlineActionButton>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------- Vista previa
  const p = await buildPreview(db, userId, id, today());
  const { counts, normalized, rows } = p;
  const bc = normalized.balanceCheck;
  const ordered = [
    ...rows.filter((r) => r.dedup.status === "PROBABLE_DUPLICATE"),
    ...rows.filter((r) => r.dedup.status === "NEW"),
    ...rows.filter((r) => r.dedup.status === "DUPLICATE"),
  ];
  const beforeOpening = rows.filter((r) => r.beforeOpening && r.dedup.status !== "DUPLICATE").length;
  const uncategorized = rows.filter((r) => !r.categoryId && r.dedup.status !== "DUPLICATE").length;

  return (
    <>
      <PageHeader title={title} description={description} />
      <Stepper current={2} />

      <Card>
        <p className="text-lg font-semibold">Se han detectado {counts.detected} operaciones.</p>
        <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-muted">Nuevas</p>
            <p className="text-xl font-semibold text-positive">{counts.new}</p>
          </div>
          <div>
            <p className="text-muted">Ya existían</p>
            <p className="text-xl font-semibold">{counts.duplicate}</p>
          </div>
          <div>
            <p className="text-muted">Posibles duplicados</p>
            <p className={`text-xl font-semibold ${counts.probable ? "text-warning" : ""}`}>{counts.probable}</p>
          </div>
          <div>
            <p className="text-muted">No válidas</p>
            <p className={`text-xl font-semibold ${counts.invalid ? "text-warning" : ""}`}>{counts.invalid}</p>
          </div>
        </div>
        {normalized.periodStart && normalized.periodEnd && (
          <p className="mt-3 text-sm text-muted">
            Periodo: {formatDateES(normalized.periodStart)} – {formatDateES(normalized.periodEnd)} · {uncategorized} sin categoría tras aplicar reglas
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {p.suspectedInvertedSign && (
            <Notice tone="warning">
              El saldo del fichero solo cuadra si se <strong>invierten los signos</strong>. Vuelve al paso de columnas y marca «Invertir signos».
            </Notice>
          )}
          {bc.checked > 0 && bc.mismatches > 0 && !p.suspectedInvertedSign && (
            <Notice tone="warning">
              El saldo del propio extracto no es coherente en {bc.mismatches} de {bc.checked} filas
              {bc.firstMismatchRow !== null ? ` (primera: fila ${bc.firstMismatchRow + 1} del fichero)` : ""}. Revisa el separador decimal y las
              columnas de importe; también puede deberse a operaciones del mismo día en otro orden.
            </Notice>
          )}
          {bc.checked > 0 && bc.mismatches === 0 && (
            <Notice tone="positive">El saldo del extracto es coherente fila a fila: importes leídos correctamente.</Notice>
          )}
          {p.reconciliation &&
            (p.reconciliation.difference === 0 ? (
              <Notice tone="positive">
                Tras importar, el saldo calculado a {formatDateES(p.reconciliation.date)} coincidirá con el del banco (
                {formatMoney(p.reconciliation.statement)}).
              </Notice>
            ) : (
              <Notice tone="warning">
                Tras importar, el saldo calculado a {formatDateES(p.reconciliation.date)} será {formatMoney(p.reconciliation.computedAfter)} y el
                del banco es {formatMoney(p.reconciliation.statement)}: diferencia{" "}
                <strong>{formatMoney(p.reconciliation.difference, { signed: true })}</strong>.
                {p.openingSuggestion ? " Puedes ajustar el saldo inicial abajo." : " Revisa el saldo inicial de la cuenta o si faltan movimientos anteriores."}
              </Notice>
            ))}
          {beforeOpening > 0 && (
            <Notice tone="info">
              {beforeOpening} operación(es) son de fecha igual o anterior al saldo inicial de la cuenta ({formatDateES(imp.account.openingDate)}): se
              guardarán para el análisis, pero no modifican el saldo.
              {p.openingSuggestion && " Si creaste la cuenta con el saldo de hoy, marca abajo «Ajustar el saldo inicial» para que el histórico cuadre."}
            </Notice>
          )}
        </div>
      </Card>

      {normalized.invalid.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-3 text-base font-semibold">Filas no válidas (no se importarán)</h2>
          <ul className="space-y-1 text-sm">
            {normalized.invalid.map((i) => (
              <li key={i.rowIndex}>
                <span className="text-muted">Fila {i.rowIndex + 1}:</span> {i.reason}{" "}
                <span className="font-mono text-xs text-muted">{i.cells.map(cellText).filter(Boolean).join(" | ").slice(0, 100)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <CommitForm
        action={commitImportAction.bind(null, id)}
        openingSuggestion={
          p.openingSuggestion
            ? {
                text: `Ajustar el saldo inicial de la cuenta a ${formatMoney(p.openingSuggestion.balance)} a fecha ${formatDateES(p.openingSuggestion.date)} (deducido del extracto; ahora es ${formatMoney(p.openingSuggestion.current.balance)} a ${formatDateES(p.openingSuggestion.current.date)}).`,
              }
            : null
        }
        defaultProfileName={imp.profile?.name ?? imp.account.institution ?? imp.account.name}
        hasProfile={!!imp.profile}
        importable={counts.new + counts.probable}
      >
        <Table>
          <thead>
            <tr>
              <Th className="w-8">
                <span className="sr-only">Importar</span>
              </Th>
              <Th>Fecha</Th>
              <Th>Descripción</Th>
              <Th className="hidden md:table-cell">Categoría propuesta</Th>
              <Th align="right">Importe</Th>
              <Th className="hidden sm:table-cell">Estado</Th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((r) => {
              const selectable = r.dedup.status !== "DUPLICATE";
              const other =
                r.dedup.status === "DUPLICATE"
                  ? p.duplicatesOf.get(r.dedup.existingId)
                  : r.dedup.status === "PROBABLE_DUPLICATE"
                    ? p.duplicatesOf.get(r.dedup.candidateIds[0]!)
                    : undefined;
              return (
                <tr key={r.rowIndex} className={r.dedup.status === "DUPLICATE" ? "text-muted" : r.dedup.status === "PROBABLE_DUPLICATE" ? "bg-warning/5" : ""}>
                  <Td>
                    {selectable && (
                      <>
                        <input type="hidden" name="selectable" value={r.rowIndex} />
                        <input
                          type="checkbox"
                          name="include"
                          value={r.rowIndex}
                          defaultChecked
                          className="size-4 accent-info"
                          aria-label={`Importar fila ${r.rowIndex + 1}`}
                        />
                      </>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">{formatDateES(r.date)}</Td>
                  <Td>
                    <span className="font-medium">{r.descriptionClean}</span>
                    {r.descriptionClean !== r.description && <div className="font-mono text-xs text-muted">{r.description}</div>}
                    {other && (
                      <div className="text-xs text-warning">
                        {r.dedup.status === "DUPLICATE" ? "Ya existe" : "Parecida a"}: «{other.descriptionRaw}» {formatDateES(other.date)}
                      </div>
                    )}
                    {r.warnings.map((w) => (
                      <div key={w} className="text-xs text-warning">
                        {w}
                      </div>
                    ))}
                    <div className="text-xs text-muted md:hidden">{r.categoryLabel ?? "Sin categoría"}</div>
                  </Td>
                  <Td className="hidden md:table-cell">{r.categoryLabel ?? <span className="text-warning">Sin categoría</span>}</Td>
                  <Td align="right">
                    <Money cents={r.amount} className="font-medium" />
                    {r.balanceAfter !== null && <div className="text-xs text-muted">saldo {formatMoney(r.balanceAfter)}</div>}
                  </Td>
                  <Td className="hidden sm:table-cell">
                    {r.dedup.status === "NEW" && <Badge tone="positive">Nueva</Badge>}
                    {r.dedup.status === "DUPLICATE" && <Badge>Ya existía</Badge>}
                    {r.dedup.status === "PROBABLE_DUPLICATE" && <Badge tone="warning">¿Duplicado?</Badge>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </CommitForm>

      <div className="mt-4 flex flex-wrap gap-2">
        <InlineActionButton action={editMappingAction.bind(null, id)}>Volver a columnas</InlineActionButton>
        <InlineActionButton action={discardImportAction.bind(null, id)} variant="danger" confirm="¿Descartar esta importación?">
          Descartar
        </InlineActionButton>
      </div>
    </>
  );
}
