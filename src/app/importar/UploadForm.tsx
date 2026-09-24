"use client";

import { ActionForm, Field, inputClass, SubmitButton } from "@/components/ui/form";
import { uploadStatementAction } from "./actions";

export function UploadForm({ accounts }: { accounts: Array<{ id: string; name: string }> }) {
  return (
    <ActionForm action={uploadStatementAction} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Cuenta del extracto" name="accountId">
        <select id="accountId" name="accountId" required className={inputClass}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Fichero (CSV o XLSX)" name="file">
        <input
          id="file"
          name="file"
          type="file"
          required
          accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-2 file:py-1 file:text-sm`}
        />
      </Field>
      <div>
        <SubmitButton>Analizar</SubmitButton>
      </div>
    </ActionForm>
  );
}
