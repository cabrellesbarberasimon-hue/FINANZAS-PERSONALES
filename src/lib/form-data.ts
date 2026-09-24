import { parseDate } from "@/domain/dates";
import { parseUserAmount } from "@/domain/money";

/** Lectura tipada de FormData. Devuelve undefined si el campo está vacío. */
export function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

/** input type="date" -> fecha contable. Devuelve null si es inválida. */
export function date(fd: FormData, key: string): Date | null | undefined {
  const v = str(fd, key);
  if (v === undefined) return undefined;
  return parseDate(v, "YYYY-MM-DD");
}

/** Importe tecleado -> céntimos. null si no es un número válido. */
export function amount(fd: FormData, key: string): number | null | undefined {
  const v = str(fd, key);
  if (v === undefined) return undefined;
  return parseUserAmount(v);
}

/** Selector combinado "categoryId|subcategoryId". */
export function categoryPair(fd: FormData, key: string): { categoryId?: string; subcategoryId?: string } {
  const v = str(fd, key);
  if (!v) return {};
  const [categoryId, subcategoryId] = v.split("|");
  return { categoryId: categoryId || undefined, subcategoryId: subcategoryId || undefined };
}
