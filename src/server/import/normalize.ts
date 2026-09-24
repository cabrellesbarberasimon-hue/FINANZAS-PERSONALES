import { daysBetween, parseDate, utcDate } from "@/domain/dates";
import { parseAmount } from "@/domain/money";
import type { Cell, ImportConfig, InvalidRow, NormalizedRow, RawTable } from "./types";

/**
 * Convierte la tabla cruda en operaciones normalizadas usando la
 * configuración de columnas. Nunca descarta una fila con datos en silencio:
 * lo que no se puede interpretar va a `invalid` con el motivo.
 */

export interface NormalizeResult {
  /** En orden CRONOLÓGICO (el fichero puede venir de más nuevo a más antiguo). */
  rows: NormalizedRow[];
  invalid: InvalidRow[];
  /** Orden del fichero original. */
  fileOrder: "ascending" | "descending" | "unknown";
  periodStart: Date | null;
  periodEnd: Date | null;
  /** Saldo final del extracto (fila cronológicamente última con saldo). */
  statementBalance: { date: Date; balance: number } | null;
  balanceCheck: BalanceCheck;
}

/**
 * Coherencia del saldo DENTRO del fichero: saldo[i] = saldo[i-1] + importe[i].
 * Detecta errores de lectura (signo, separador decimal, columnas cruzadas)
 * antes de importar nada.
 */
export interface BalanceCheck {
  /** Pares consecutivos comparables (ambos con saldo). */
  checked: number;
  mismatches: number;
  /** Mismos pares, pero invirtiendo el signo de los importes. */
  mismatchesIfInverted: number;
  /** Primera fila (índice de tabla) donde el saldo deja de cuadrar. */
  firstMismatchRow: number | null;
}

function cellText(c: Cell | undefined): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
}

function parseCellAmount(c: Cell | undefined, config: ImportConfig): number | null | undefined {
  if (c === null || c === undefined || c === "") return undefined;
  if (typeof c === "number") return parseAmount(c);
  if (typeof c !== "string") return null;
  return parseAmount(c, config.decimalSeparator);
}

const MAX_FUTURE_DAYS = 3;

export function normalizeTable(table: RawTable, config: ImportConfig, today: Date): NormalizeResult {
  const { columns } = config;
  const parsed: NormalizedRow[] = [];
  const invalid: InvalidRow[] = [];

  for (let i = config.headerRow + 1; i < table.rows.length; i++) {
    const cells = table.rows[i] ?? [];
    if (!cells.some((c) => c !== null && cellText(c) !== "")) continue; // fila vacía

    const reject = (reason: string) => invalid.push({ rowIndex: i, cells, reason });

    if (columns.date === null) {
      reject("No se ha asignado la columna de fecha.");
      continue;
    }
    const rawDate = cells[columns.date];
    const date = rawDate === null || rawDate === undefined ? null : parseDate(rawDate as string | number | Date, config.dateFormat);
    if (!date) {
      reject(
        rawDate === null || rawDate === undefined
          ? "Fila sin fecha (¿total, saldo o pie de página?)."
          : !/\d/.test(cellText(rawDate))
            ? `Fila sin fecha (¿total, saldo o pie de página?): «${cellText(rawDate)}».`
            : `Fecha no válida: «${cellText(rawDate)}» (formato ${config.dateFormat}).`,
      );
      continue;
    }

    let amount: number | null;
    if (columns.amount !== null) {
      const a = parseCellAmount(cells[columns.amount], config);
      if (a === undefined) {
        reject("Importe vacío.");
        continue;
      }
      amount = a;
      if (amount === null) {
        reject(`Importe no válido: «${cellText(cells[columns.amount])}».`);
        continue;
      }
    } else if (columns.debit !== null || columns.credit !== null) {
      const d = columns.debit !== null ? parseCellAmount(cells[columns.debit], config) : undefined;
      const c = columns.credit !== null ? parseCellAmount(cells[columns.credit], config) : undefined;
      if (d === null || c === null) {
        reject("Cargo o abono no válido.");
        continue;
      }
      const debit = Math.abs(d ?? 0);
      const credit = Math.abs(c ?? 0);
      if (debit !== 0 && credit !== 0) {
        reject("La fila tiene cargo y abono a la vez.");
        continue;
      }
      if (debit === 0 && credit === 0) {
        reject("Sin cargo ni abono.");
        continue;
      }
      amount = credit - debit;
    } else {
      reject("No se ha asignado la columna de importe (o de cargo/abono).");
      continue;
    }
    if (amount === 0) {
      reject("Importe 0 (operación informativa).");
      continue;
    }
    if (config.invertSign) amount = -amount;

    const description =
      columns.description
        .map((ci) => cellText(cells[ci]))
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim() || "(sin concepto)";

    let balanceAfter: number | null = null;
    const warnings: string[] = [];
    if (columns.balance !== null) {
      const b = parseCellAmount(cells[columns.balance], config);
      if (b === null) warnings.push(`Saldo no válido: «${cellText(cells[columns.balance])}» (se ignora).`);
      else if (b !== undefined) balanceAfter = b;
    }

    const valueDate =
      columns.valueDate !== null && cells[columns.valueDate] != null
        ? parseDate(cells[columns.valueDate] as string | number | Date, config.dateFormat)
        : null;

    if (daysBetween(today, date) > MAX_FUTURE_DAYS) warnings.push("Fecha futura: revisa el formato de fecha.");

    parsed.push({
      rowIndex: i,
      date,
      valueDate,
      amount,
      description,
      balanceAfter,
      bankCategory: columns.category !== null ? cellText(cells[columns.category]) || null : null,
      warnings,
    });
  }

  // Orden del fichero: comparando primera y última fecha.
  let fileOrder: NormalizeResult["fileOrder"] = "unknown";
  if (parsed.length >= 2) {
    const first = parsed[0]!.date.getTime();
    const last = parsed[parsed.length - 1]!.date.getTime();
    fileOrder = first < last ? "ascending" : first > last ? "descending" : "unknown";
  }
  // Orden cronológico canónico. Si el fichero va de nuevo a antiguo se invierte
  // entero (así el orden dentro de un mismo día también queda cronológico).
  const chronological = fileOrder === "descending" ? [...parsed].reverse() : [...parsed];
  chronological.sort((a, b) => a.date.getTime() - b.date.getTime()); // estable

  return {
    rows: chronological,
    invalid,
    fileOrder,
    periodStart: chronological[0]?.date ?? null,
    periodEnd: chronological[chronological.length - 1]?.date ?? null,
    statementBalance: lastBalance(chronological),
    balanceCheck: checkBalances(chronological),
  };
}

function lastBalance(rows: NormalizedRow[]): NormalizeResult["statementBalance"] {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (r.balanceAfter !== null) return { date: r.date, balance: r.balanceAfter };
  }
  return null;
}

export function checkBalances(rows: NormalizedRow[]): BalanceCheck {
  let checked = 0;
  let mismatches = 0;
  let mismatchesIfInverted = 0;
  let firstMismatchRow: number | null = null;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const cur = rows[i]!;
    if (prev.balanceAfter === null || cur.balanceAfter === null) continue;
    checked++;
    if (prev.balanceAfter + cur.amount !== cur.balanceAfter) {
      mismatches++;
      firstMismatchRow ??= cur.rowIndex;
    }
    if (prev.balanceAfter - cur.amount !== cur.balanceAfter) mismatchesIfInverted++;
  }
  return { checked, mismatches, mismatchesIfInverted, firstMismatchRow };
}

/**
 * Saldo al FINAL del día anterior al primer movimiento del extracto,
 * deducido de la columna de saldo. Solo es fiable si el saldo del fichero es
 * coherente; si no, devuelve null.
 */
export function openingFromStatement(result: NormalizeResult): { date: Date; balance: number } | null {
  const { rows, balanceCheck } = result;
  if (rows.length === 0 || balanceCheck.checked === 0 || balanceCheck.mismatches > 0) return null;
  const firstDay = rows[0]!.date.getTime();
  const firstDayRows = rows.filter((r) => r.date.getTime() === firstDay);
  const lastOfDay = firstDayRows[firstDayRows.length - 1]!;
  if (lastOfDay.balanceAfter === null) return null;
  const dayTotal = firstDayRows.reduce((s, r) => s + r.amount, 0);
  const d = rows[0]!.date;
  return {
    date: utcDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate() - 1),
    balance: lastOfDay.balanceAfter - dayTotal,
  };
}
