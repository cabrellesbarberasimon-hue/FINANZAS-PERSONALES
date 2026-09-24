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
