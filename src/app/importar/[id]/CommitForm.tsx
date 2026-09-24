"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { ActionForm, Checkbox, Field, inputClass, SubmitButton } from "@/components/ui/form";
import type { ActionResult } from "@/lib/action-result";

export function CommitForm({
  action,
  children,
  openingSuggestion,
  defaultProfileName,
  hasProfile,
  importable,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  openingSuggestion: { text: string } | null;
  defaultProfileName: string;
  hasProfile: boolean;
  importable: number;
}) {
  return (
    <ActionForm action={action}>
      <Card className="mt-6 p-0 sm:p-0">
        <div className="p-4 sm:p-5">
          <h2 className="text-base font-semibold">Operaciones</h2>
          <p className="mt-1 text-sm text-muted">
            Desmarca las que no quieras importar. Las marcadas como «¿Duplicado?» se importarán y quedarán pendientes de revisión.
          </p>
        </div>
        {children}
      </Card>
      <Card className="mt-6 flex flex-col gap-4">
        {openingSuggestion && <Checkbox name="adjustOpening" label={openingSuggestion.text} />}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
          <Checkbox name="saveProfile" defaultChecked={!hasProfile} label="Recordar este formato para próximas importaciones" />
          <Field label="Nombre del formato" name="profileName">
            <input id="profileName" name="profileName" defaultValue={defaultProfileName} placeholder="Banco X — cuenta" className={inputClass} />
          </Field>
        </div>
        <div>
          <SubmitButton>{importable > 0 ? `Importar operaciones seleccionadas` : "Registrar importación (sin operaciones nuevas)"}</SubmitButton>
        </div>
      </Card>
    </ActionForm>
  );
}
