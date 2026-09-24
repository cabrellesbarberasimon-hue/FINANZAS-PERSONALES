"use client";

import type { ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import { ActionForm, SubmitButton } from "./form";

/** Botón que ejecuta una Server Action (archivar, borrar...), con confirmación opcional. */
export function InlineActionButton({
  action,
  children,
  variant = "secondary",
  confirm,
  hidden,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  confirm?: string;
  hidden?: Record<string, string>;
}) {
  return (
    <ActionForm action={action} className="inline-block">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton variant={variant} confirm={confirm}>
        {children}
      </SubmitButton>
    </ActionForm>
  );
}
