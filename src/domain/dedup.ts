import { createHash } from "node:crypto";
import { daysBetween, toISODate } from "./dates";
import { descriptionSimilarity, normalizeForHash } from "./text";

/**
 * Sistema anti-duplicados (docs/ARQUITECTURA.md §6).
 *
 * Nivel 1 — Duplicado EXACTO (se descarta, nunca se inserta):
 *   hash = sha256(cuenta | fecha | importe | descripción normalizada | ocurrencia)
 *   con restricción UNIQUE(accountId, dedupHash) en base de datos.
 *
 *   La "ocurrencia" resuelve el caso legítimo de dos operaciones idénticas el
 *   mismo día (dos cafés de 1,50 € en el mismo bar): dentro de un fichero, la
 *   1ª tiene ocurrencia 0, la 2ª ocurrencia 1. Reimportar el mismo fichero o un
 *   extracto solapado genera los mismos hashes -> se detectan como existentes.
 *
 * Nivel 2 — Duplicado PROBABLE (se marca para revisión, nunca en silencio):
 *   misma cuenta, mismo importe, fecha a ±3 días y descripción parecida, pero
 *   hash distinto (p.ej. el banco cambió el texto o la fecha valor).
 */

export const DEDUP_HASH_VERSION = 1;
export const PROBABLE_DUPLICATE_MAX_DAYS = 3;
export const PROBABLE_DUPLICATE_MIN_SIMILARITY = 0.5;

export interface DedupFields {
  accountId: string;
  date: Date;
  amount: number; // céntimos
  description: string; // descripción ORIGINAL (se normaliza aquí)
}

/** Clave de agrupación para contar ocurrencias (sin la ocurrencia). */
export function occurrenceKey(f: Omit<DedupFields, "accountId">): string {
  return `${toISODate(f.date)}|${f.amount}|${normalizeForHash(f.description)}`;
}

export function computeDedupHash(f: DedupFields, occurrence: number): string {
  const payload = [
    `v${DEDUP_HASH_VERSION}`,
    f.accountId,
    toISODate(f.date),
    String(f.amount),
    normalizeForHash(f.description),
    String(occurrence),
  ].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Asigna ocurrencia y hash a las filas de UN fichero, respetando su orden.
 * Devuelve las filas con `occurrence` y `dedupHash`.
 */
export function assignDedupHashes<T extends Omit<DedupFields, "accountId">>(
  accountId: string,
  rows: T[],
): Array<T & { occurrence: number; dedupHash: string }> {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = occurrenceKey(row);
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return {
      ...row,
      occurrence,
      dedupHash: computeDedupHash({ ...row, accountId }, occurrence),
    };
  });
}

export interface ExistingTx {
  id: string;
  date: Date;
  amount: number;
  descriptionRaw: string;
  dedupHash: string;
}

export type DedupStatus =
  | { status: "NEW" }
  | { status: "DUPLICATE"; existingId: string }
  | { status: "PROBABLE_DUPLICATE"; candidateIds: string[] };

export function isProbableDuplicate(
  row: { date: Date; amount: number; description: string },
  existing: ExistingTx,
): boolean {
  if (row.amount !== existing.amount) return false;
  const days = Math.abs(daysBetween(row.date, existing.date));
  if (days > PROBABLE_DUPLICATE_MAX_DAYS) return false;
  const sim = descriptionSimilarity(row.description, existing.descriptionRaw);
  // Mismo día y mismo importe con descripción algo distinta también es sospechoso.
  return sim >= PROBABLE_DUPLICATE_MIN_SIMILARITY || (days === 0 && sim > 0);
}

/**
 * Clasifica filas ya hasheadas contra las operaciones existentes de la cuenta
 * (el llamador debe pasar las existentes en el rango de fechas del fichero
 * ± PROBABLE_DUPLICATE_MAX_DAYS).
 *
 * Una operación existente solo puede "casar" como probable con una fila si no
 * es ya el duplicado exacto de otra fila del mismo fichero.
 */
export function classifyRows<
  T extends { date: Date; amount: number; description: string; dedupHash: string },
>(rows: T[], existing: ExistingTx[]): Array<T & { dedup: DedupStatus }> {
  const byHash = new Map(existing.map((e) => [e.dedupHash, e]));
  const exactMatched = new Set<string>();
  for (const r of rows) {
    const e = byHash.get(r.dedupHash);
    if (e) exactMatched.add(e.id);
  }
  const pool = existing.filter((e) => !exactMatched.has(e.id));

  return rows.map((row) => {
    const exact = byHash.get(row.dedupHash);
    if (exact) return { ...row, dedup: { status: "DUPLICATE", existingId: exact.id } as const };
    const candidates = pool.filter((e) => isProbableDuplicate(row, e)).map((e) => e.id);
    if (candidates.length > 0) {
      return { ...row, dedup: { status: "PROBABLE_DUPLICATE", candidateIds: candidates } as const };
    }
    return { ...row, dedup: { status: "NEW" } as const };
  });
}
