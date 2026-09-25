import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { InlineActionButton } from "@/components/ui/InlineActionButton";
import { InlineTextForm } from "@/components/ui/InlineTextForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { inputClass } from "@/components/ui/styles";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { CATEGORY_KIND_LABELS, listCategoriesWithUsage } from "@/server/services/categories";
import {
  archiveCategoryAction,
  archiveSubcategoryAction,
  createCategoryAction,
  createSubcategoryAction,
  deleteCategoryAction,
  deleteSubcategoryAction,
  renameCategoryAction,
  renameSubcategoryAction,
} from "../actions";

export const metadata: Metadata = { title: "Categorías" };

export default async function CategoriesPage() {
  const cats = await listCategoriesWithUsage(db, await getCurrentUserId());
  return (
    <>
      <PageHeader
        title="Categorías"
        description="El tipo de la categoría decide si sus movimientos cuentan como gasto, ingreso, transferencia o inversión. Renombrar no altera ningún cálculo."
      />
      <Card className="mb-6">
        <h2 className="mb-3 text-base font-semibold">Nueva categoría</h2>
        <InlineTextForm action={createCategoryAction} placeholder="Nombre (p.ej. Mascotas)" submitLabel="Crear" resetOnSuccess>
          <select name="kind" defaultValue="EXPENSE" className={`${inputClass} w-auto`} aria-label="Tipo">
            {Object.entries(CATEGORY_KIND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </InlineTextForm>
      </Card>

      <div className="flex flex-col gap-4">
        {cats.map((c) => {
          const used = c._count.transactions + c._count.rules + c._count.budgets;
          return (
            <Card key={c.id} className={c.archived ? "opacity-60" : undefined}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: c.color ?? "#94a3b8" }} aria-hidden />
                <h2 className="text-base font-semibold">{c.name}</h2>
                <Badge tone="info">{CATEGORY_KIND_LABELS[c.kind]}</Badge>
                {c.isSystem && <Badge>Sistema</Badge>}
                {c.archived && <Badge>Archivada</Badge>}
                <Link href={`/movimientos?categoria=${c.id}%7C`} className="ml-auto text-xs text-info hover:underline">
                  {c._count.transactions} movimientos · {c._count.rules} reglas
                </Link>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <InlineTextForm action={renameCategoryAction.bind(null, c.id)} defaultValue={c.name} submitLabel="Renombrar" />
                <div className="flex gap-2">
                  {!c.isSystem && (
                    <InlineActionButton action={archiveCategoryAction.bind(null, c.id)} hidden={{ archived: String(!c.archived) }}>
                      {c.archived ? "Reactivar" : "Archivar"}
                    </InlineActionButton>
                  )}
                  {!c.isSystem && used === 0 && (
                    <InlineActionButton action={deleteCategoryAction.bind(null, c.id)} variant="danger" confirm={`¿Borrar «${c.name}»?`}>
                      Borrar
                    </InlineActionButton>
                  )}
                </div>
              </div>

              <ul className="mt-4 divide-y divide-border border-t border-border">
                {c.subcategories.map((s) => {
                  const subUsed = s._count.transactions + s._count.rules + s._count.budgets;
                  return (
                    <li key={s.id} className={`grid gap-2 py-2 md:grid-cols-[1fr_auto_auto] md:items-center ${s.archived ? "opacity-60" : ""}`}>
                      <InlineTextForm action={renameSubcategoryAction.bind(null, s.id)} defaultValue={s.name} submitLabel="Renombrar" />
                      <Link href={`/movimientos?categoria=${c.id}%7C${s.id}`} className="text-xs text-muted hover:underline">
                        {s._count.transactions} mov.
                      </Link>
                      <div className="flex gap-2">
                        <InlineActionButton action={archiveSubcategoryAction.bind(null, s.id)} hidden={{ archived: String(!s.archived) }}>
                          {s.archived ? "Reactivar" : "Archivar"}
                        </InlineActionButton>
                        {subUsed === 0 && (
                          <InlineActionButton action={deleteSubcategoryAction.bind(null, s.id)} variant="danger" confirm={`¿Borrar «${s.name}»?`}>
                            Borrar
                          </InlineActionButton>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3">
                <InlineTextForm action={createSubcategoryAction.bind(null, c.id)} placeholder="Nueva subcategoría" submitLabel="Añadir" resetOnSuccess />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
