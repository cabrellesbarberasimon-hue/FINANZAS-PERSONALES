"use client";

import type { ActionResult } from "@/lib/action-result";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES, type AccountType } from "@/domain/accounts";
import { ActionForm, Field, inputClass, SubmitButton } from "@/components/ui/form";

export interface AccountFormDefaults {
  name?: string;
  institution?: string | null;
  type?: AccountType;
  currency?: string;
  identifier?: string | null;
  notes?: string | null;
  openingBalance?: string;
  openingDate?: string;
}

export function AccountForm({
  action,
  defaults = {},
  submitLabel,
  next,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  defaults?: AccountFormDefaults;
  submitLabel: string;
  next?: string;
}) {
  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Nombre" name="name">
        <input id="name" name="name" required defaultValue={defaults.name} placeholder="Cuenta principal" className={inputClass} />
      </Field>
      <Field label="Entidad" name="institution">
        <input id="institution" name="institution" defaultValue={defaults.institution ?? ""} placeholder="Banco X" className={inputClass} />
      </Field>
      <Field label="Tipo" name="type" hint="«Inversión» y «Otros activos» se valoran con saldos manuales, sin movimientos.">
        <select id="type" name="type" defaultValue={defaults.type ?? "CHECKING"} className={inputClass}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Moneda" name="currency" hint="Por ahora los totales solo suman cuentas en EUR.">
        <input id="currency" name="currency" defaultValue={defaults.currency ?? "EUR"} maxLength={3} className={inputClass} />
      </Field>
      <Field
        label="Saldo inicial (€)"
        name="openingBalance"
        hint="Saldo al FINAL del día indicado. En tarjetas, negativo si debes dinero."
      >
        <input
          id="openingBalance"
          name="openingBalance"
          inputMode="decimal"
          required
          defaultValue={defaults.openingBalance ?? ""}
          placeholder="3.450,00"
          className={inputClass}
        />
      </Field>
      <Field
        label="Fecha del saldo"
        name="openingDate"
        hint="Los movimientos de este día o anteriores se consideran ya incluidos en el saldo."
      >
        <input id="openingDate" name="openingDate" type="date" required defaultValue={defaults.openingDate} className={inputClass} />
      </Field>
      <Field label="Identificador (opcional)" name="identifier" hint="Últimos dígitos o alias. Nunca contraseñas.">
        <input id="identifier" name="identifier" defaultValue={defaults.identifier ?? ""} placeholder="···· 1234" className={inputClass} />
      </Field>
      <Field label="Notas" name="notes">
        <input id="notes" name="notes" defaultValue={defaults.notes ?? ""} className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
