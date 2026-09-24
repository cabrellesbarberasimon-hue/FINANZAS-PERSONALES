import { detectDateFormat } from "@/domain/dates";
import { detectDecimalSeparator } from "@/domain/money";
import { stripAccents } from "@/domain/text";
import type { Cell, ColumnMapping, ImportConfig, RawTable } from "./types";

/** Texto de cabecera normalizado: minúsculas, sin acentos ni puntuación. */
export function normalizeHeader(c: Cell): string {
  if (c === null || c === undefined) return "";
  return stripAccents(String(c)).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const HEADER_KEYWORDS = [
  "fecha", "date", "concepto", "descripcion", "description", "importe", "amount",
  "saldo", "balance", "cargo", "abono", "debe", "haber", "movimiento", "operacion", "detalle",
];

/**
 * Fila de cabecera: muchos bancos ponen títulos, titular o IBAN antes de la
 * tabla. Se elige, entre las 40 primeras, la fila con más celdas de texto que
 * contienen palabras clave (mínimo 2).
 */
export function detectHeaderRow(table: RawTable): number {
  let best = -1;
  let bestScore = 0;
  const limit = Math.min(table.rows.length, 40);
  for (let i = 0; i < limit; i++) {
    const cells = (table.rows[i] ?? []).map(normalizeHeader).filter(Boolean);
    const hits = cells.filter((c) => HEADER_KEYWORDS.some((k) => c.includes(k))).length;
    const textCells = (table.rows[i] ?? []).filter((c) => typeof c === "string").length;
    if (hits >= 2 && hits * 10 + textCells > bestScore) {
      bestScore = hits * 10 + textCells;
      best = i;
    }
  }
  if (best >= 0) return best;
  // Sin palabras clave: la primera fila con el máximo de celdas no vacías.
  let max = 0;
  for (let i = 0; i < limit; i++) {
    const n = (table.rows[i] ?? []).filter((c) => c !== null).length;
    if (n > max) {
      max = n;
      best = i;
    }
  }
  return Math.max(best, 0);
}

export function headerLabels(table: RawTable, headerRow: number): string[] {
  const width = Math.max(0, ...table.rows.map((r) => r.length));
  const header = table.rows[headerRow] ?? [];
  return Array.from({ length: width }, (_, i) => {
    const h = header[i];
    return h === null || h === undefined || String(h).trim() === "" ? `Columna ${i + 1}` : String(h).trim();
  });
}

/** Firma del formato: cabeceras normalizadas. Identifica el banco en futuras importaciones. */
export function headerSignature(table: RawTable, headerRow: number): string {
  return (table.rows[headerRow] ?? []).map(normalizeHeader).join("|");
}

function findColumn(headers: string[], patterns: RegExp[], exclude: Set<number>): number | null {
  for (const re of patterns) {
    const idx = headers.findIndex((h, i) => !exclude.has(i) && re.test(h));
    if (idx >= 0) return idx;
  }
  return null;
}

export function dataRows(table: RawTable, headerRow: number): Cell[][] {
  return table.rows.slice(headerRow + 1).filter((r) => r.some((c) => c !== null));
}

function columnSamples(table: RawTable, headerRow: number, col: number | null, n = 50): Cell[] {
  if (col === null) return [];
  return dataRows(table, headerRow)
    .map((r) => r[col] ?? null)
    .filter((c) => c !== null)
    .slice(0, n);
}

/** Propuesta de mapeo a partir de los nombres de las columnas. */
export function suggestConfig(table: RawTable, headerRow = detectHeaderRow(table)): ImportConfig {
  const headers = (table.rows[headerRow] ?? []).map(normalizeHeader);
  const used = new Set<number>();
  const take = (patterns: RegExp[]) => {
    const i = findColumn(headers, patterns, used);
    if (i !== null) used.add(i);
    return i;
  };

  const valueDate = take([/fecha valor/, /^f valor/, /value date/]);
  const date = take([/fecha (de )?operacion/, /^f operacion/, /^fecha$/, /fecha/, /^date$/, /date/]);
  const balance = take([/^saldo$/, /saldo/, /balance/, /disponible/]);
  const debit = take([/^cargo/, /^debe$/, /^debito/, /^debit/, /^gastos?$/, /^salidas?$/]);
  const credit = take([/^abono/, /^haber$/, /^credito/, /^credit/, /^ingresos?$/, /^entradas?$/]);
  const amount = debit !== null && credit !== null ? null : take([/^importe/, /importe/, /amount/, /cantidad/, /^euros?$/]);
  const category = take([/categoria/, /category/]);
  const description = take([/concepto/, /descripcion/, /description/, /detalle/, /movimiento/, /operacion/, /comercio/]);
  const extra = take([/mas datos/, /observaciones/, /informacion adicional/, /referencia/]);

  const columns: ColumnMapping = {
    date,
    valueDate,
    description: [description, extra].filter((x): x is number => x !== null),
    amount,
    debit: amount === null ? debit : null,
    credit: amount === null ? credit : null,
    balance,
    category,
  };

  const dateSamples = columnSamples(table, headerRow, date);
  const { format } = detectDateFormat(dateSamples as Array<string | number | Date>);
  const amountSamples = [
    ...columnSamples(table, headerRow, columns.amount),
    ...columnSamples(table, headerRow, columns.debit),
    ...columnSamples(table, headerRow, columns.credit),
    ...columnSamples(table, headerRow, balance),
  ];
  const decimalSeparator = detectDecimalSeparator(amountSamples.map((c) => (typeof c === "string" ? c : null)));

  return {
    headerRow,
    columns,
    dateFormat: format ?? "DD/MM/YYYY",
    decimalSeparator,
    invertSign: false,
    confirmed: false,
  };
}

/** ¿El formato de fecha elegido es ambiguo para este fichero (todas las fechas con día ≤ 12)? */
export function isDateFormatAmbiguous(table: RawTable, config: ImportConfig): boolean {
  const samples = columnSamples(table, config.headerRow, config.columns.date, 500);
  return detectDateFormat(samples as Array<string | number | Date>).ambiguous;
}
