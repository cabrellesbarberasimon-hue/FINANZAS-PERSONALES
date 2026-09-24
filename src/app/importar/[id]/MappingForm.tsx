"use client";

import { useState } from "react";
import { ActionForm, Checkbox, Field, inputClass, SubmitButton } from "@/components/ui/form";
import type { ActionResult } from "@/lib/action-result";
import type { ImportConfig } from "@/server/import/types";
import { columnLetter } from "@/lib/columns";

const DATE_FORMAT_LABELS: Record<string, string> = {
  "DD/MM/YYYY": "DD/MM/AAAA (31/12/2026)",
  "DD-MM-YYYY": "DD-MM-AAAA (31-12-2026)",
  "YYYY-MM-DD": "AAAA-MM-DD (2026-12-31)",
  "MM/DD/YYYY": "MM/DD/AAAA (12/31/2026, formato EE. UU.)",
  "DD/MM/YY": "DD/MM/AA (31/12/26)",
};

function ColumnSelect({
  headers,
  name,
  value,
  optional = true,
}: {
  headers: string[];
  name: string;
  value: number | null;
  optional?: boolean;
}) {
  return (
    <select id={name} name={name} defaultValue={value === null ? "" : String(value)} className={inputClass}>
      <option value="">{optional ? "— No usar —" : "— Elige columna —"}</option>
      {headers.map((h, i) => (
        <option key={i} value={i}>
          {columnLetter(i)} · {h}
        </option>
      ))}
    </select>
  );
}

export function MappingForm({
  action,
  config,
  headers,
  headerRowOptions,
  dateAmbiguous,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  config: ImportConfig;
  headers: string[];
  headerRowOptions: Array<{ index: number; label: string }>;
  dateAmbiguous: boolean;
}) {
  const [split, setSplit] = useState(config.columns.amount === null && (config.columns.debit !== null || config.columns.credit !== null));
  const c = config.columns;

  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Fila de cabecera" name="headerRow" hint="Si la cambias, se vuelven a proponer las columnas.">
          <select id="headerRow" name="headerRow" defaultValue={String(config.headerRow)} className={inputClass}>
            {headerRowOptions.map((o) => (
              <option key={o.index} value={o.index}>
                Fila {o.index + 1}: {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha de la operación" name="date">
          <ColumnSelect headers={headers} name="date" value={c.date} optional={false} />
        </Field>
        <Field label="Fecha valor (opcional)" name="valueDate">
          <ColumnSelect headers={headers} name="valueDate" value={c.valueDate} />
        </Field>
        <Field
          label="Formato de fecha"
          name="dateFormat"
          hint={dateAmbiguous ? "⚠ Todas las fechas tienen día ≤ 12: confirma que es día/mes y no mes/día." : undefined}
        >
          <select id="dateFormat" name="dateFormat" defaultValue={config.dateFormat} className={inputClass}>
            {Object.entries(DATE_FORMAT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Separador decimal" name="decimalSeparator">
          <select id="decimalSeparator" name="decimalSeparator" defaultValue={config.decimalSeparator} className={inputClass}>
            <option value=",">Coma: 1.234,56</option>
            <option value=".">Punto: 1,234.56</option>
          </select>
        </Field>
        <Field label="Saldo tras la operación (opcional)" name="balance" hint="Permite comprobar el extracto y conciliar.">
          <ColumnSelect headers={headers} name="balance" value={c.balance} />
        </Field>
      </div>

      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Descripción (puedes marcar varias columnas; se unen en orden)</legend>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
          {headers.map((h, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="description" value={i} defaultChecked={c.description.includes(i)} className="size-4 accent-info" />
              {columnLetter(i)} · {h}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Importe</legend>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="amountMode" value="single" checked={!split} onChange={() => setSplit(false)} className="accent-info" />
            Una columna con signo (−45,23)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="amountMode" value="split" checked={split} onChange={() => setSplit(true)} className="accent-info" />
            Columnas separadas de cargo y abono
          </label>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {split ? (
            <>
              <Field label="Cargo (salidas)" name="debit">
                <ColumnSelect headers={headers} name="debit" value={c.debit} />
              </Field>
              <Field label="Abono (entradas)" name="credit">
                <ColumnSelect headers={headers} name="credit" value={c.credit} />
              </Field>
            </>
          ) : (
            <Field label="Importe" name="amount">
              <ColumnSelect headers={headers} name="amount" value={c.amount} optional={false} />
            </Field>
          )}
          <Field label="Categoría del banco (opcional)" name="category" hint="Se guarda como nota; no sustituye a tus categorías.">
            <ColumnSelect headers={headers} name="category" value={c.category} />
          </Field>
        </div>
        <div className="mt-3">
          <Checkbox
            name="invertSign"
            defaultChecked={config.invertSign}
            label="Invertir signos (extractos de tarjeta donde las compras aparecen en positivo)"
          />
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <SubmitButton name="op" value="confirm">
          Ver vista previa
        </SubmitButton>
        <SubmitButton name="op" value="redetect" variant="secondary">
          Volver a detectar columnas
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
