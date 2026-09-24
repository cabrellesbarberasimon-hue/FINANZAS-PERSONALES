import type { TxKind } from "@/domain/cashflow";
import { parseDate } from "@/domain/dates";
import { parseUserAmount } from "@/domain/money";
import { TX_KINDS } from "@/domain/transactions";

/**
 * Filtros de /movimientos en la URL, en español para que los enlaces sean
 * legibles: /movimientos?mes=2026-09&tipo=EXPENSE&categoria=<id>
 * Cualquier cifra de la aplicación puede enlazar aquí para mostrar las
 * operaciones que la forman.
 */
export interface MovementSearch {
  q?: string;
  mes?: string;
  anio?: string;
  desde?: string;
  hasta?: string;
  cuenta?: string;
  categoria?: string;
  tipo?: string;
  min?: string;
  max?: string;
  importacion?: string;
  revisado?: string;
  pagina?: string;
}

export interface ParsedMovementFilters {
  from?: Date;
  to?: Date;
  month?: string;
  year?: number;
  accountId?: string;
  categoryId?: string;
  subcategoryId?: string;
  kind?: TxKind;
  minAmount?: number;
  maxAmount?: number;
  q?: string;
  importId?: string;
  reviewed?: boolean;
}

function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== "" ? s.trim() : undefined;
}

export function parseMovementSearch(sp: Record<string, string | string[] | undefined>): {
  filters: ParsedMovementFilters;
  page: number;
  raw: MovementSearch;
} {
  const raw: MovementSearch = {};
  for (const k of ["q", "mes", "anio", "desde", "hasta", "cuenta", "categoria", "tipo", "min", "max", "importacion", "revisado", "pagina"] as const) {
    const v = first(sp[k]);
    if (v !== undefined) raw[k] = v;
  }
  const f: ParsedMovementFilters = {};
  if (raw.q) f.q = raw.q;
  if (raw.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw.mes)) f.month = raw.mes;
  if (raw.anio && /^\d{4}$/.test(raw.anio)) f.year = Number(raw.anio);
  if (raw.desde) f.from = parseDate(raw.desde, "YYYY-MM-DD") ?? undefined;
  if (raw.hasta) f.to = parseDate(raw.hasta, "YYYY-MM-DD") ?? undefined;
  if (raw.cuenta) f.accountId = raw.cuenta;
  if (raw.categoria) {
    const [c, s] = raw.categoria.split("|");
    if (c) f.categoryId = c;
    if (s) f.subcategoryId = s;
  }
  if (raw.tipo && (TX_KINDS as string[]).includes(raw.tipo)) f.kind = raw.tipo as TxKind;
  if (raw.min) f.minAmount = Math.abs(parseUserAmount(raw.min) ?? 0) || undefined;
  if (raw.max) {
    const m = parseUserAmount(raw.max);
    if (m !== null) f.maxAmount = Math.abs(m);
  }
  if (raw.importacion) f.importId = raw.importacion;
  if (raw.revisado === "si") f.reviewed = true;
  if (raw.revisado === "no") f.reviewed = false;
  const page = Math.max(1, Number(raw.pagina) || 1);
  return { filters: f, page, raw };
}

export function movementHref(params: MovementSearch): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/movimientos?${s}` : "/movimientos";
}
