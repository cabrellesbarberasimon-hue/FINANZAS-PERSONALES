"use client";

import type { ActionResult } from "@/lib/action-result";
import { ActionForm, SubmitButton } from "./form";
import { inputClass } from "./styles";

/** Campo de texto + botón en línea (renombrar, añadir subcategoría...). */
export function InlineTextForm({
  action,
  name = "name",
  defaultValue,
  placeholder,
  submitLabel,
  resetOnSuccess,
  children,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel: string;
  resetOnSuccess?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <ActionForm action={action} resetOnSuccess={resetOnSuccess} className="flex flex-wrap items-center gap-2">
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} required className={`${inputClass} w-auto min-w-0 flex-1`} aria-label={placeholder ?? submitLabel} />
      {children}
      <SubmitButton variant="secondary">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
