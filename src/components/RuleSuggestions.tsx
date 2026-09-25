import { Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { InlineActionButton } from "@/components/ui/InlineActionButton";
import { acceptSuggestionAction, dismissSuggestionAction } from "@/app/configuracion/actions";
import type { SuggestionView } from "@/server/services/rules";

/** Sugerencias de reglas aprendidas de las correcciones del usuario. */
export function RuleSuggestions({ suggestions }: { suggestions: SuggestionView[] }) {
  if (suggestions.length === 0) return null;
  return (
    <Card className="border-info/30 bg-info/5">
      <div className="flex items-center gap-2 text-info">
        <Lightbulb className="size-4" aria-hidden />
        <h2 className="text-base font-semibold">Reglas sugeridas</h2>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {suggestions.map((s) => {
          const hidden = { merchantKey: s.merchantKey, categoryId: s.categoryId, subcategoryId: s.subcategoryId ?? "" };
          return (
            <li key={`${s.merchantKey}|${s.categoryId}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <p className="flex-1">
                Has clasificado <strong>{s.merchantKey}</strong> como <strong>{s.label}</strong> {s.count} veces.
                {s.affected > 0 && ` Hay ${s.affected} movimiento(s) sin categoría a los que se aplicaría.`}
              </p>
              <div className="flex gap-2">
                <InlineActionButton action={acceptSuggestionAction} hidden={hidden} variant="primary">
                  Crear regla
                </InlineActionButton>
                <InlineActionButton action={dismissSuggestionAction} hidden={hidden}>
                  No, gracias
                </InlineActionButton>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
