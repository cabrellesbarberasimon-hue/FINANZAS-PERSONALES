"use client";

import type { ReactNode } from "react";
import { ActionForm, Checkbox, Field, SubmitButton } from "@/components/ui/form";
import { inputClass } from "@/components/ui/styles";
import type { ActionResult } from "@/lib/action-result";

export interface RuleFormDefaults {
  name?: string | null;
  field?: "DESCRIPTION" | "MERCHANT";
  matchType?: "CONTAINS" | "STARTS_WITH" | "EQUALS" | "REGEX";
  pattern?: string;
  accountId?: string | null;
  amountMin?: string;
  amountMax?: string;
  priority?: number;
  active?: boolean;
}

export function RuleForm({
  action,
  categorySelect,
  accounts,
  defaults = {},
  isNew,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  categorySelect: ReactNode;
  accounts: Array<{ id: string; name: string }>;
  defaults?: RuleFormDefaults;
  isNew: boolean;
}) {
  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Si…" name="field">
        <select id="field" name="field" defaultValue={defaults.field ?? "DESCRIPTION"} className={inputClass}>
          <option value="DESCRIPTION">la descripción del banco</option>
          <option value="MERCHANT">la clave de comercio (sin números ni ruido)</option>
        </select>
      </Field>
      <Field label="…" name="matchType" hint="«Contiene» busca palabras completas: DIA no coincide con MEDIA.">
        <select id="matchType" name="matchType" defaultValue={defaults.matchType ?? "CONTAINS"} className={inputClass}>
          <option value="CONTAINS">contiene</option>
          <option value="STARTS_WITH">empieza por</option>
          <option value="EQUALS">es exactamente</option>
          <option value="REGEX">coincide con la expresión regular</option>
        </select>
      </Field>
      <Field label="Texto" name="pattern" hint="No distingue mayúsculas ni acentos.">
        <input id="pattern" name="pattern" required defaultValue={defaults.pattern} placeholder="MERCADONA" className={inputClass} />
      </Field>
      <Field label="Entonces: categoría" name="category">
        {categorySelect}
      </Field>
      <Field label="Solo en la cuenta (opcional)" name="accountId">
        <select id="accountId" name="accountId" defaultValue={defaults.accountId ?? ""} className={inputClass}>
          <option value="">Cualquier cuenta</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe desde (€)" name="amountMin">
          <input id="amountMin" name="amountMin" inputMode="decimal" defaultValue={defaults.amountMin} className={inputClass} />
        </Field>
        <Field label="hasta (€)" name="amountMax">
          <input id="amountMax" name="amountMax" inputMode="decimal" defaultValue={defaults.amountMax} className={inputClass} />
        </Field>
      </div>
      <Field label="Prioridad" name="priority" hint="Mayor gana. En empate, gana el texto más largo.">
        <input id="priority" name="priority" type="number" min={-100} max={100} defaultValue={defaults.priority ?? 0} className={inputClass} />
      </Field>
      <Field label="Nombre (opcional)" name="name">
        <input id="name" name="name" defaultValue={defaults.name ?? ""} className={inputClass} />
      </Field>
      <Field label="Estado" name="active">
        <select id="active" name="active" defaultValue={defaults.active === false ? "off" : "on"} className={inputClass}>
          <option value="on">Activa</option>
          <option value="off">Desactivada</option>
        </select>
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Checkbox
          name="applyNow"
          defaultChecked
          label={isNew ? "Aplicarla ahora a los movimientos sin categoría" : "Recalcular ahora los movimientos categorizados por reglas"}
        />
        <p className="text-xs text-muted">Los movimientos que has categorizado a mano nunca se modifican.</p>
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <SubmitButton name="op" value="preview" variant="secondary">
          Probar: ¿a qué movimientos afecta?
        </SubmitButton>
        <SubmitButton name="op" value="save">
          Guardar regla
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
