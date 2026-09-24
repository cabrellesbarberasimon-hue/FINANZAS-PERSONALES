"use client";

import type { ReactNode } from "react";
import type { TxKind } from "@/domain/cashflow";
import { ActionForm, Checkbox, Field, inputClass, SubmitButton } from "@/components/ui/form";
import type { ActionResult } from "@/lib/action-result";
import { AmountFields, KindField } from "../TransactionFields";

export function EditTransactionForm({
  action,
  categorySelect,
  editableBankData,
  defaults,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  categorySelect: ReactNode;
  editableBankData: boolean;
  defaults: {
    descriptionClean: string;
    descriptionRaw: string;
    merchant: string | null;
    notes: string | null;
    kind: TxKind;
    isExtraordinary: boolean;
    reviewed: boolean;
    date: string;
    amountAbs: string;
    direction: "in" | "out";
  };
}) {
  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <input type="hidden" name="editableBankData" value={editableBankData ? "1" : "0"} />
      {editableBankData && (
        <>
          <Field label="Fecha" name="date">
            <input id="date" name="date" type="date" required defaultValue={defaults.date} className={inputClass} />
          </Field>
          <Field label="Descripción original" name="descriptionRaw">
            <input id="descriptionRaw" name="descriptionRaw" required defaultValue={defaults.descriptionRaw} className={inputClass} />
          </Field>
          <AmountFields defaultAmount={defaults.amountAbs} defaultDirection={defaults.direction} />
        </>
      )}
      <Field label="Descripción" name="descriptionClean" className="sm:col-span-2">
        <input id="descriptionClean" name="descriptionClean" required defaultValue={defaults.descriptionClean} className={inputClass} />
      </Field>
      <Field label="Categoría" name="category">
        {categorySelect}
      </Field>
      <KindField defaultKind={defaults.kind} />
      <Field label="Comercio" name="merchant">
        <input id="merchant" name="merchant" defaultValue={defaults.merchant ?? ""} className={inputClass} />
      </Field>
      <Field label="Notas" name="notes">
        <input id="notes" name="notes" defaultValue={defaults.notes ?? ""} className={inputClass} />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Checkbox name="isExtraordinary" label="Extraordinario (no recurrente)" defaultChecked={defaults.isExtraordinary} />
        <Checkbox name="reviewed" label="Revisado" defaultChecked={defaults.reviewed} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton>Guardar cambios</SubmitButton>
      </div>
    </ActionForm>
  );
}
