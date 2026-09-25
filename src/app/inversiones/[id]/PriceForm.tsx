"use client";

import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { inputClass } from "@/components/ui/styles";
import type { ActionResult } from "@/lib/action-result";

export function PriceForm({ action, unitsMode, today }: { action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>; unitsMode: boolean; today: string }) {
  return (
    <ActionForm action={action} resetOnSuccess className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_12rem_auto] sm:items-end">
      <Field label="Fecha" name="date">
        <input id="price-date" name="date" type="date" required defaultValue={today} className={inputClass} />
      </Field>
      {unitsMode ? (
        <Field label="Valor liquidativo" name="price">
          <input id="price-value" name="price" inputMode="decimal" required placeholder="107,21" className={inputClass} />
        </Field>
      ) : (
        <Field label="Valor total (€)" name="totalValue">
          <input id="price-total" name="totalValue" inputMode="decimal" required placeholder="11.250,00" className={inputClass} />
        </Field>
      )}
      <div>
        <SubmitButton>Añadir valoración</SubmitButton>
      </div>
    </ActionForm>
  );
}
