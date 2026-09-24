import type { DateFormat } from "@/domain/dates";
import type { DecimalSeparator } from "@/domain/money";

/** Valor de una celda tal como lo entrega el parser. */
export type Cell = string | number | boolean | Date | null;

/** Tabla cruda: filas × celdas, sin interpretar. */
export interface RawTable {
  rows: Cell[][];
  /** Información de lectura (codificación, delimitador, hoja...). */
  meta: Record<string, string>;
}

export type FileKind = "csv" | "xlsx";

/**
 * Interfaz de un lector de extractos. Para añadir un formato (p.ej. PDF):
 * implementarla y registrarla en parsers/index.ts.
 */
export interface StatementParser {
  kind: FileKind;
  /** Decide por el CONTENIDO (no por la extensión) si sabe leer el fichero. */
  canParse(bytes: Uint8Array, fileName: string): boolean;
  parse(bytes: Uint8Array): Promise<RawTable>;
}

/** Índices de columna (0-based) dentro de la tabla. */
export interface ColumnMapping {
  date: number | null;
  valueDate: number | null;
  /** Varias columnas se concatenan (p.ej. "Concepto" + "Más datos"). */
  description: number[];
  /** Importe con signo en una sola columna... */
  amount: number | null;
  /** ...o cargo y abono en columnas separadas. */
  debit: number | null;
  credit: number | null;
  balance: number | null;
  category: number | null;
}

/**
 * Configuración completa de cómo interpretar un fichero. Se guarda en
 * Import.mapping (auditoría) y en ImportProfile.config (reutilización).
 */
export interface ImportConfig {
  headerRow: number;
  columns: ColumnMapping;
  dateFormat: DateFormat;
  decimalSeparator: DecimalSeparator;
  /** Invertir signos (extractos de tarjeta donde las compras vienen en positivo). */
  invertSign: boolean;
  /** El usuario ha revisado y confirmado el mapeo. */
  confirmed: boolean;
}

export interface NormalizedRow {
  /** Índice de la fila en la tabla original (trazabilidad hasta el fichero). */
  rowIndex: number;
  date: Date;
  valueDate: Date | null;
  amount: number;
  description: string;
  balanceAfter: number | null;
  bankCategory: string | null;
  warnings: string[];
}

export interface InvalidRow {
  rowIndex: number;
  cells: Cell[];
  reason: string;
}
