"use client";

import type { ActionResult } from "@/lib/action-result";
import { ActionForm, Field, inputClass, SubmitButton } from "@/components/ui/form";

export function BalanceForm({
  action,
  defaultDate,
  balanceLabel,
  submitLabel,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  defaultDate: string;
  balanceLabel: string;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} resetOnSuccess className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_12rem_1fr_auto] sm:items-end">
      <Field label="Fecha" name="date">
        <input id="date" name="date" type="date" required defaultValue={defaultDate} className={inputClass} />
      </Field>
      <Field label={balanceLabel} name="balance">
        <input id="balance" name="balance" inputMode="decimal" required placeholder="5.435,23" className={inputClass} />
      </Field>
      <Field label="Nota" name="notes">
        <input id="notes" name="notes" className={inputClass} />
      </Field>
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
