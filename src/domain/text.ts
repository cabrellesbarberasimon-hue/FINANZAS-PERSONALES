/**
 * Normalización de descripciones bancarias.
 *
 * Hay TRES niveles, con propósitos distintos:
 *
 * 1. `normalizeForHash`  — mínimo y estable. Solo elimina diferencias que no
 *    cambian el significado (mayúsculas, acentos, espacios). Se usa en el hash
 *    de deduplicación, así que NO debe cambiar nunca sin migrar hashes.
 * 2. `cleanDescription`  — legible para la interfaz (quita ruido como
 *    "COMPRA TARJ. 1234XXXX5678").
 * 3. `merchantKey`       — agresivo: agrupa variantes del mismo comercio
 *    ("MERCADONA 1234 VALENCIA", "MERCADONA SA") para aprendizaje de reglas y
 *    detección de recurrentes.
 */

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** ¡Estable! Cambiarla invalida los hashes de deduplicación existentes. */
export function normalizeForHash(raw: string): string {
  return stripAccents(raw).toUpperCase().replace(/\s+/g, " ").trim();
}

const NOISE_PATTERNS: RegExp[] = [
  /\b(COMPRA|PAGO|CARGO|ADEUDO|RECIBO)\s+(CON\s+)?(TARJ(ETA)?\.?|TJ\.?)(\s+CREDITO|\s+DEBITO)?/g,
  /\bTARJ(ETA)?\.?\s*[\dX*]{4,}/g,
  /\b\d{4}[X*]{4,}\d{0,4}\b/g,
  /\bCONTACTLESS\b/g,
  /\bFECHA\s+OPERACION\b.*$/g,
];

export function cleanDescription(raw: string): string {
  let s = normalizeForHash(raw);
  for (const re of NOISE_PATTERNS) s = s.replace(re, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s || normalizeForHash(raw);
}

const MERCHANT_STOPWORDS = new Set([
  "SA", "SL", "SLU", "S.A", "S.L", "ES", "ESP", "SPAIN", "ESPANA",
  "COMPRA", "PAGO", "RECIBO", "ADEUDO", "CARGO", "TRANSFERENCIA", "TRANSF",
  "EN", "DE", "DEL", "LA", "EL", "WWW", "COM",
]);

/**
 * Clave de comercio: primeras palabras significativas sin números.
 * "COMPRA TARJ. 4012XXXX1234 MERCADONA VALENCIA" -> "MERCADONA VALENCIA"
 * Se limita a 2 palabras para agrupar sucursales ("MERCADONA ALZIRA").
 */
export function merchantKey(raw: string, maxWords = 2): string {
  const words = cleanDescription(raw)
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !/\d/.test(w) && !MERCHANT_STOPWORDS.has(w));
  return words.slice(0, maxWords).join(" ");
}

/** Similitud Jaccard de palabras (0..1) entre dos descripciones. */
export function descriptionSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeForHash(a).split(/[^A-Z0-9]+/).filter(Boolean));
  const tb = new Set(normalizeForHash(b).split(/[^A-Z0-9]+/).filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}
