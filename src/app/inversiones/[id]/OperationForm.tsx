"use client";

import { useState } from "react";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { inputClass } from "@/components/ui/styles";
import type { ActionResult } from "@/lib/action-result";

export function OperationForm({
  action,
  unitsMode,
  today,
  movements,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  unitsMode: boolean;
  today: string;
  movements: Array<{ id: string; label: string }>;
}) {
  const [type, setType] = useState("BUY");
  const trade = unitsMode && (type === "BUY" || type === "SELL");
  return (
    <ActionForm action={action} resetOnSuccess className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Operación" name="type">
        <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
          <option value="BUY">Aportación / compra</option>
          <option value="SELL">Reembolso / venta</option>
          <option value="DIVIDEND">Dividendo</option>
          <option value="FEE">Comisión</option>
        </select>
      </Field>
      <Field label="Fecha" name="date">
        <input id="date" name="date" type="date" required defaultValue={today} className={inputClass} />
      </Field>
      <Field label={type === "SELL" ? "Importe bruto recibido (€)" : "Importe (€)"} name="amount" hint={type === "BUY" ? "Lo invertido, sin comisiones." : undefined}>
        <input id="amount" name="amount" inputMode="decimal" required placeholder="300,00" className={inputClass} />
      </Field>
      {type !== "FEE" && (
        <Field label="Comisiones (€)" name="fees">
          <input id="fees" name="fees" inputMode="decimal" placeholder="0,00" className={inputClass} />
        </Field>
      )}
      {trade && (
        <>
          <Field label="Participaciones" name="units" hint="Rellena participaciones o precio (o ambos).">
            <input id="units" name="units" inputMode="decimal" placeholder="2,847921" className={inputClass} />
          </Field>
          <Field label="Valor liquidativo / precio" name="price">
            <input id="price" name="price" inputMode="decimal" placeholder="105,34" className={inputClass} />
          </Field>
        </>
      )}
      <Field label="Movimiento bancario (opcional)" name="cashTransactionId" hint="Vincula el cargo/abono: deja de contar como gasto/ingreso." className="sm:col-span-2">
        <select id="cashTransactionId" name="cashTransactionId" defaultValue="" className={inputClass}>
          <option value="">— Sin vincular —</option>
          {movements.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notas" name="notes" className={trade ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-4"}>
        <input id="notes" name="notes" className={inputClass} />
      </Field>
      <div className="sm:col-span-2 lg:col-span-4">
        <SubmitButton>Registrar operación</SubmitButton>
      </div>
    </ActionForm>
  );
}
