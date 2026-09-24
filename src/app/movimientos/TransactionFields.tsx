"use client";

import { Field, inputClass } from "@/components/ui/form";
import { TX_KIND_LABELS, TX_KINDS } from "@/domain/transactions";
import type { TxKind } from "@/domain/cashflow";

/** Dirección + importe: el usuario escribe siempre el importe en positivo. */
export function AmountFields({ defaultAmount, defaultDirection = "out" }: { defaultAmount?: string; defaultDirection?: "in" | "out" }) {
  return (
    <>
      <Field label="Dirección" name="direction">
        <select id="direction" name="direction" defaultValue={defaultDirection} className={inputClass}>
          <option value="out">Salida de dinero (−)</option>
          <option value="in">Entrada de dinero (+)</option>
        </select>
      </Field>
      <Field label="Importe (€)" name="amount">
        <input id="amount" name="amount" inputMode="decimal" required defaultValue={defaultAmount} placeholder="45,23" className={inputClass} />
      </Field>
    </>
  );
}

export function KindField({ defaultKind }: { defaultKind?: TxKind }) {
  return (
    <Field label="Tipo (si no eliges categoría)" name="kind" hint="Con categoría, el tipo lo marca la categoría.">
      <select id="kind" name="kind" defaultValue={defaultKind ?? "EXPENSE"} className={inputClass}>
        {TX_KINDS.map((k) => (
          <option key={k} value={k}>
            {TX_KIND_LABELS[k]}
          </option>
        ))}
      </select>
    </Field>
  );
}
