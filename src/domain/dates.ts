/**
 * Fechas contables: solo importa el día. Se representan como `Date` a las
 * 00:00:00 UTC para que la zona horaria del servidor nunca mueva un
 * movimiento de un día (o mes) a otro.
 */

export type DateFormat = "DD/MM/YYYY" | "DD-MM-YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YY";

export const DATE_FORMATS: DateFormat[] = [
  "DD/MM/YYYY",
  "DD-MM-YYYY",
  "YYYY-MM-DD",
  "MM/DD/YYYY",
  "DD/MM/YY",
];

export function utcDate(year: number, month1: number, day: number): Date {
  return new Date(Date.UTC(year, month1 - 1, day));
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return false;
  const dt = utcDate(y, m, d);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Excel guarda fechas como nº de días desde 1899-12-30 (sistema 1900). */
export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 200000) return null;
  const ms = Math.round(serial) * 86_400_000;
  return new Date(Date.UTC(1899, 11, 30) + ms);
}

/**
 * Parsea una fecha con un formato EXPLÍCITO (no se adivina fila a fila:
 * "03/04/2026" es 3 de abril o 4 de marzo según el banco).
 * Acepta también `Date` y números de serie de Excel.
 */
export function parseDate(
  input: string | number | Date | null | undefined,
  format: DateFormat,
): Date | null {
  if (input === null || input === undefined) return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    // read-excel-file devuelve las fechas de Excel a las 00:00 UTC: se usa el día UTC.
    return utcDate(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
  }
  if (typeof input === "number") return excelSerialToDate(input);

  const s = input.trim().split(/[ T]/)[0] ?? "";
  let y: number, m: number, d: number;
  let parts: string[];
  switch (format) {
    case "YYYY-MM-DD":
      parts = s.split(/[-/.]/);
      [y, m, d] = parts.map(Number) as [number, number, number];
      break;
    case "MM/DD/YYYY":
      parts = s.split(/[-/.]/);
      [m, d, y] = parts.map(Number) as [number, number, number];
      break;
    case "DD/MM/YY":
      parts = s.split(/[-/.]/);
      [d, m, y] = parts.map(Number) as [number, number, number];
      if (parts[2]?.length === 2) y += 2000;
      break;
    case "DD/MM/YYYY":
    case "DD-MM-YYYY":
      parts = s.split(/[-/.]/);
      [d, m, y] = parts.map(Number) as [number, number, number];
      break;
  }
  if (parts.length !== 3) return null;
  return isValidYMD(y, m, d) ? utcDate(y, m, d) : null;
}

/**
 * Propone el formato de fecha de una columna: el primero que parsea TODAS las
 * muestras. Si "DD/MM" y "MM/DD" valen ambos (todas las fechas con día ≤ 12),
 * se prefiere DD/MM (convención española) y se marca como ambiguo para que
 * la interfaz pida confirmación.
 */
export function detectDateFormat(
  samples: Array<string | number | Date | null | undefined>,
): { format: DateFormat | null; ambiguous: boolean } {
  const values = samples.filter((v) => v !== null && v !== undefined && v !== "");
  if (values.length === 0) return { format: null, ambiguous: false };
  const ok = DATE_FORMATS.filter((f) => values.every((v) => parseDate(v, f) !== null));
  if (ok.length === 0) return { format: null, ambiguous: false };
  const format = ok[0]!;
  const ambiguous = ok.includes("DD/MM/YYYY") && ok.includes("MM/DD/YYYY");
  return { format, ambiguous };
}

/** "YYYY-MM-DD" */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM" */
export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Primer día del mes (incl.) y primer día del mes siguiente (excl.). */
export function monthRange(key: string): { start: Date; end: Date } {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return { start: utcDate(y, m, 1), end: utcDate(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) };
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function formatDateES(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "Europe/Madrid";

/** Fecha de HOY en la zona horaria del usuario, como fecha contable (00:00 UTC). */
export function today(timeZone: string = APP_TIME_ZONE): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parseDate(parts, "YYYY-MM-DD")!;
}
