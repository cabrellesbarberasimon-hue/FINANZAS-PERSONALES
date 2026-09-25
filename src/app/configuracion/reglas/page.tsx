import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { RuleSuggestions } from "@/components/RuleSuggestions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { InlineActionButton } from "@/components/ui/InlineActionButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClass } from "@/components/ui/styles";
import { Table, Td, Th } from "@/components/ui/Table";
import { formatMoney } from "@/domain/money";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { getRuleSuggestions, listRules } from "@/server/services/rules";
import { applyRulesAction, detectTransfersAction, toggleRuleAction } from "../actions";

export const metadata: Metadata = { title: "Reglas" };

const MATCH = { CONTAINS: "contiene", STARTS_WITH: "empieza por", EQUALS: "es", REGEX: "regex" } as const;
const ORIGIN = { USER: "Tuya", LEARNED: "Aprendida", SYSTEM: "Sistema" } as const;

type Rule = Awaited<ReturnType<typeof listRules>>[number];

function RulesTable({ rules }: { rules: Rule[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Condición</Th>
          <Th>Categoría</Th>
          <Th align="right" className="hidden sm:table-cell">Aplicada</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {rules.map((r) => (
          <tr key={r.id} className={r.active ? "" : "opacity-50"}>
            <Td>
              <Link href={`/configuracion/reglas/${r.id}`} className="hover:underline">
                <span className="text-muted">{r.field === "MERCHANT" ? "comercio" : "descripción"} {MATCH[r.matchType]} </span>
                <span className="font-mono font-medium">{r.pattern}</span>
              </Link>
              <div className="flex flex-wrap gap-1 text-xs text-muted">
                <Badge tone={r.origin === "SYSTEM" ? "neutral" : "info"}>{ORIGIN[r.origin]}</Badge>
                {r.account && <span>solo {r.account.name}</span>}
                {(r.amountMin !== null || r.amountMax !== null) && (
                  <span>
                    importe {r.amountMin !== null ? `≥ ${formatMoney(r.amountMin)}` : ""} {r.amountMax !== null ? `≤ ${formatMoney(r.amountMax)}` : ""}
                  </span>
                )}
                {r.priority !== 0 && <span>prioridad {r.priority}</span>}
              </div>
            </Td>
            <Td>
              {r.category.name}
              {r.subcategory && <span className="text-muted"> / {r.subcategory.name}</span>}
            </Td>
            <Td align="right" className="hidden text-muted sm:table-cell">
              {r.timesApplied}
            </Td>
            <Td align="right">
              <InlineActionButton action={toggleRuleAction.bind(null, r.id)} hidden={{ active: String(!r.active) }}>
                {r.active ? "Desactivar" : "Activar"}
              </InlineActionButton>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ guardada?: string }> }) {
  const { guardada } = await searchParams;
  const userId = await getCurrentUserId();
  const [rules, suggestions, uncategorized] = await Promise.all([
    listRules(db, userId),
    getRuleSuggestions(db, userId),
    db.transaction.count({ where: { userId, categoryId: null } }),
  ]);
  const mine = rules.filter((r) => r.origin !== "SYSTEM");
  const system = rules.filter((r) => r.origin === "SYSTEM");

  return (
    <>
      <PageHeader
        title="Reglas automáticas"
        description="Se aplican al importar y al crear movimientos. Tus reglas tienen preferencia sobre las del sistema."
        actions={
          <Link href="/configuracion/reglas/nueva" className={buttonClass()}>
            <Plus className="size-4" /> Regla
          </Link>
        }
      />
      {guardada && <p className="mb-4 rounded-lg border border-positive/20 bg-positive/10 px-3 py-2 text-sm text-positive">Regla guardada.</p>}

      <div className="flex flex-col gap-6">
        <RuleSuggestions suggestions={suggestions} />

        <Card>
          <h2 className="text-base font-semibold">Aplicar</h2>
          <p className="mb-3 mt-1 text-sm text-muted">
            {uncategorized} movimiento(s) sin categoría.{" "}
            <Link href="/movimientos?categoria=none%7C" className="text-info hover:underline">Verlos</Link>
          </p>
          <div className="flex flex-wrap gap-2">
            <InlineActionButton action={applyRulesAction} hidden={{ scope: "uncategorized" }} variant="primary">
              Aplicar reglas a los sin categoría
            </InlineActionButton>
            <InlineActionButton
              action={applyRulesAction}
              hidden={{ scope: "automatic" }}
              confirm="Se recalcularán todos los movimientos categorizados por reglas (nunca los categorizados a mano). ¿Continuar?"
            >
              Recalcular todos los automáticos
            </InlineActionButton>
            <InlineActionButton action={detectTransfersAction}>Buscar transferencias internas</InlineActionButton>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-semibold">Tus reglas ({mine.length})</h2>
          {mine.length === 0 ? (
            <p className="text-sm text-muted">
              Aún no has creado reglas. También puedes crearlas desde un movimiento («Crear regla con este movimiento») o aceptando sugerencias.
            </p>
          ) : (
            <RulesTable rules={mine} />
          )}
        </Card>

        <details className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <summary className="cursor-pointer text-base font-semibold">Reglas del sistema ({system.length})</summary>
          <div className="mt-3">
            <RulesTable rules={system} />
          </div>
        </details>
      </div>
    </>
  );
}
