"use client";

import type { ReactNode } from "react";
import { ActionForm, Checkbox, Field, inputClass, SubmitButton } from "@/components/ui/form";
import { createTransactionAction } from "../actions";
import { AmountFields, KindField } from "../TransactionFields";

export function NewTransactionForm({
  accounts,
  categorySelect,
  today,
  defaultAccountId,
}: {
  accounts: Array<{ id: string; name: string }>;
  categorySelect: ReactNode;
  today: string;
  defaultAccountId?: string;
}) {
  return (
    <ActionForm action={createTransactionAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Cuenta" name="accountId">
        <select id="accountId" name="accountId" required defaultValue={defaultAccountId ?? accounts[0]?.id} className={inputClass}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Fecha" name="date">
        <input id="date" name="date" type="date" required defaultValue={today} className={inputClass} />
      </Field>
      <AmountFields />
      <Field label="Descripción" name="description" className="sm:col-span-2">
        <input id="description" name="description" required placeholder="Mercadona Valencia" className={inputClass} />
      </Field>
      <Field label="Categoría" name="category">
        {categorySelect}
      </Field>
      <KindField />
      <Field label="Comercio (opcional)" name="merchant">
        <input id="merchant" name="merchant" className={inputClass} />
      </Field>
      <Field label="Notas" name="notes">
        <input id="notes" name="notes" className={inputClass} />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Checkbox name="isExtraordinary" label="Gasto o ingreso extraordinario (no recurrente)" />
        <Checkbox name="allowDuplicate" label="Es otra operación distinta aunque ya exista una idéntica ese día" />
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <SubmitButton>Guardar</SubmitButton>
        <SubmitButton variant="secondary" name="another" value="1">
          Guardar y añadir otro
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
