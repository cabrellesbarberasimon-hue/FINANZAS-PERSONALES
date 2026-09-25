import { daysBetween } from "./dates";

/**
 * Transferencias internas (docs/ARQUITECTURA.md §7): dos movimientos en
 * cuentas propias DISTINTAS, importes opuestos EXACTOS y fechas cercanas.
 */

export const TRANSFER_MAX_DAYS = 5;

export interface TransferSide {
  id: string;
  accountId: string;
  date: Date;
  amount: number;
  transferPeerId: string | null;
}

export type TransferCheck = { ok: true } | { ok: false; reason: string };

export function canLinkTransfer(a: TransferSide, b: TransferSide): TransferCheck {
  if (a.id === b.id) return { ok: false, reason: "Es el mismo movimiento." };
  if (a.accountId === b.accountId) {
    return { ok: false, reason: "Una transferencia interna debe unir dos cuentas distintas." };
  }
  if (a.amount === 0 || a.amount !== -b.amount) {
    return { ok: false, reason: "Los importes deben ser opuestos y exactamente iguales." };
  }
  if (a.transferPeerId || b.transferPeerId) {
    return { ok: false, reason: "Alguno de los movimientos ya está vinculado a otra transferencia." };
  }
  if (Math.abs(daysBetween(a.date, b.date)) > TRANSFER_MAX_DAYS) {
    return { ok: false, reason: `Las fechas se separan más de ${TRANSFER_MAX_DAYS} días.` };
  }
  return { ok: true };
}

/** Candidatas a pareja de `tx`, ordenadas por cercanía de fecha. */
export function findTransferCandidates<T extends TransferSide>(tx: TransferSide, pool: T[]): T[] {
  return pool
    .filter((c) => canLinkTransfer(tx, c).ok)
    .sort(
      (x, y) => Math.abs(daysBetween(tx.date, x.date)) - Math.abs(daysBetween(tx.date, y.date)),
    );
}

/** Palabras que indican un movimiento entre cuentas propias (descripción normalizada). */
export const TRANSFER_KEYWORDS = [
  "TRASPASO",
  "TRASP",
  "TRANSFERENCIA",
  "TRANSF",
  "LIQUIDACION TARJETA",
  "PAGO TARJETA",
  "RETIRADA CAJERO",
  "RETIRADA EFECTIVO",
  "INGRESO EFECTIVO",
  "APORTACION",
  "ENVIO A",
  "INGRESO DESDE",
];

export function hasTransferKeyword(description: string): boolean {
  const d = description.toUpperCase();
  return TRANSFER_KEYWORDS.some((k) => new RegExp(`(^|[^A-Z])${k}($|[^A-Z])`).test(d));
}

export type TransferDecision<T> =
  | { tx: T; action: "LINK"; peer: T }
  | { tx: T; action: "FLAG"; candidates: T[] };

/**
 * Decide qué hacer con cada movimiento nuevo sin pareja:
 * - LINK: tiene UNA sola candidata, esa candidata solo le tiene a él como
 *   candidato, y alguna de las dos descripciones indica transferencia.
 * - FLAG: tiene candidatas pero la señal no es suficiente -> revisión manual.
 * Nunca se enlaza por mera coincidencia de importe.
 */
export function decideTransfers<T extends TransferSide & { description: string }>(
  targets: T[],
  pool: T[],
): Array<TransferDecision<T>> {
  const decisions: Array<TransferDecision<T>> = [];
  const used = new Set<string>();
  // Universo de posibles parejas: los propios movimientos nuevos también cuentan
  // (p.ej. extractos de dos cuentas importados a la vez).
  const all = [...new Map([...pool, ...targets].map((t) => [t.id, t])).values()];
  for (const tx of targets) {
    if (tx.transferPeerId || used.has(tx.id)) continue;
    const candidates = findTransferCandidates(tx, all).filter((c) => !used.has(c.id));
    if (candidates.length === 0) continue;
    const only = candidates.length === 1 ? candidates[0]! : null;
    const mutual = only && findTransferCandidates(only, all).filter((c) => !used.has(c.id)).length === 1;
    const keyword = only && (hasTransferKeyword(tx.description) || hasTransferKeyword(only.description));
    if (only && mutual && keyword) {
      decisions.push({ tx, action: "LINK", peer: only });
      used.add(tx.id);
      used.add(only.id);
    } else {
      decisions.push({ tx, action: "FLAG", candidates });
    }
  }
  return decisions;
}
