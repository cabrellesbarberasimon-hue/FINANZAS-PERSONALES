"use client";

import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { inputClass } from "@/components/ui/styles";
import type { ActionResult } from "@/lib/action-result";

const TYPES = {
  INDEX_FUND: "Fondo indexado",
  ETF: "ETF",
  ACTIVE_FUND: "Fondo activo",
  STOCK: "Acciones",
  PIAS: "PIAS",
  PENSION_PLAN: "Plan de pensiones",
  CRYPTO: "Criptomonedas",
  OTHER: "Otros",
} as const;

export interface InvestmentFormDefaults {
  name?: string;
  assetType?: keyof typeof TYPES;
  isin?: string | null;
  ticker?: string | null;
  platform?: string | null;
  accountId?: string | null;
  currency?: string;
  valuationMode?: "UNITS" | "TOTAL_VALUE";
  notes?: string | null;
}

export function InvestmentForm({
  action,
  accounts,
  defaults = {},
  submitLabel,
  lockMode,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  accounts: Array<{ id: string; name: string }>;
  defaults?: InvestmentFormDefaults;
  submitLabel: string;
  lockMode?: boolean;
}) {
  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Nombre" name="name">
        <input id="name" name="name" required defaultValue={defaults.name} placeholder="Vanguard Global Stock Index" className={inputClass} />
      </Field>
      <Field label="Tipo de activo" name="assetType">
        <select id="assetType" name="assetType" defaultValue={defaults.assetType ?? "INDEX_FUND"} className={inputClass}>
          {Object.entries(TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="ISIN (opcional)" name="isin" hint="Se comprueba el dígito de control.">
        <input id="isin" name="isin" defaultValue={defaults.isin ?? ""} placeholder="IE00B03HCZ61" maxLength={12} className={`${inputClass} font-mono uppercase`} />
      </Field>
      <Field label="Ticker (opcional)" name="ticker">
        <input id="ticker" name="ticker" defaultValue={defaults.ticker ?? ""} className={inputClass} />
      </Field>
      <Field label="Plataforma / gestora" name="platform">
        <input id="platform" name="platform" defaultValue={defaults.platform ?? ""} placeholder="MyInvestor, Indexa, Trade Republic…" className={inputClass} />
      </Field>
      <Field label="Cuenta de efectivo del broker (opcional)" name="accountId">
        <select id="accountId" name="accountId" defaultValue={defaults.accountId ?? ""} className={inputClass}>
          <option value="">—</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Cómo se valora"
        name="valuationMode"
        hint={lockMode ? "No se puede cambiar con operaciones registradas." : "Participaciones × valor liquidativo (fondos, ETF, acciones) o valor total (PIAS, planes)."}
      >
        <select id="valuationMode" name="valuationMode" defaultValue={defaults.valuationMode ?? "UNITS"} className={inputClass} disabled={lockMode}>
          <option value="UNITS">Participaciones × valor liquidativo</option>
          <option value="TOTAL_VALUE">Valor total (sin participaciones)</option>
        </select>
        {lockMode && <input type="hidden" name="valuationMode" value={defaults.valuationMode} />}
      </Field>
      <Field label="Moneda" name="currency">
        <input id="currency" name="currency" defaultValue={defaults.currency ?? "EUR"} maxLength={3} className={inputClass} />
      </Field>
      <Field label="Notas" name="notes" className="sm:col-span-2">
        <input id="notes" name="notes" defaultValue={defaults.notes ?? ""} className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
