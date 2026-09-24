"use client";

import type { ActionResult } from "@/lib/action-result";
import { ActionForm, Field, inputClass, SubmitButton } from "@/components/ui/form";

const TYPES = {
  MORTGAGE: "Hipoteca",
  LOAN: "Préstamo",
  FINANCING: "Financiación",
  CREDIT_CARD: "Tarjeta de crédito",
  OTHER: "Otra deuda",
} as const;

export interface LiabilityFormDefaults {
  name?: string;
  type?: keyof typeof TYPES;
  lender?: string | null;
  originalAmount?: string;
  interestRate?: string;
  startDate?: string;
  endDate?: string;
  monthlyPayment?: string;
  paymentAccountId?: string | null;
  notes?: string | null;
}

export function LiabilityForm({
  action,
  accounts,
  defaults = {},
  submitLabel,
  withInitialBalance,
  today,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  accounts: Array<{ id: string; name: string }>;
  defaults?: LiabilityFormDefaults;
  submitLabel: string;
  withInitialBalance?: boolean;
  today: string;
}) {
  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Nombre" name="name">
        <input id="name" name="name" required defaultValue={defaults.name} placeholder="Préstamo coche" className={inputClass} />
      </Field>
      <Field label="Tipo" name="type">
        <select id="type" name="type" defaultValue={defaults.type ?? "LOAN"} className={inputClass}>
          {Object.entries(TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      {withInitialBalance && (
        <>
          <Field label="Deuda pendiente hoy (€)" name="currentBalance" hint="Lo que queda por pagar. Déjalo vacío si no lo sabes.">
            <input id="currentBalance" name="currentBalance" inputMode="decimal" placeholder="5.000,00" className={inputClass} />
          </Field>
          <Field label="Fecha de ese saldo" name="currentBalanceDate">
            <input id="currentBalanceDate" name="currentBalanceDate" type="date" defaultValue={today} className={inputClass} />
          </Field>
        </>
      )}
      <Field label="Acreedor" name="lender">
        <input id="lender" name="lender" defaultValue={defaults.lender ?? ""} className={inputClass} />
      </Field>
      <Field label="Importe original (€)" name="originalAmount">
        <input id="originalAmount" name="originalAmount" inputMode="decimal" defaultValue={defaults.originalAmount} className={inputClass} />
      </Field>
      <Field label="Tipo de interés (TIN %)" name="interestRate">
        <input id="interestRate" name="interestRate" inputMode="decimal" defaultValue={defaults.interestRate} placeholder="3,5" className={inputClass} />
      </Field>
      <Field label="Cuota mensual (€)" name="monthlyPayment">
        <input id="monthlyPayment" name="monthlyPayment" inputMode="decimal" defaultValue={defaults.monthlyPayment} className={inputClass} />
      </Field>
      <Field label="Fecha de inicio" name="startDate">
        <input id="startDate" name="startDate" type="date" defaultValue={defaults.startDate} className={inputClass} />
      </Field>
      <Field label="Fecha de fin" name="endDate">
        <input id="endDate" name="endDate" type="date" defaultValue={defaults.endDate} className={inputClass} />
      </Field>
      <Field label="Cuenta de pago" name="paymentAccountId">
        <select id="paymentAccountId" name="paymentAccountId" defaultValue={defaults.paymentAccountId ?? ""} className={inputClass}>
          <option value="">—</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
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
