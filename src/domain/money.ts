/**
 * Dinero en CÉNTIMOS enteros. Nunca usamos coma flotante para importes:
 * 0.1 + 0.2 !== 0.3, y un error de redondeo repetido en miles de operaciones
 * rompe la conciliación con el banco.
 */

export type Cents = number;

export type DecimalSeparator = "," | ".";

/**
 * Convierte un texto de importe a céntimos de forma determinista.
 *
 * Acepta: "1.234,56", "-1.234,56", "1234,5", "12,00 €", "12,00-" (signo al
 * final), "(12,00)" (negativo contable), "+3,40", "−3,40" (signo menos
 * tipográfico) y números nativos (celdas de Excel).
 *
 * El separador decimal NO se adivina fila a fila (ambiguo: "1.234"): se
 * decide una vez por fichero con `detectDecimalSeparator` o lo fija el perfil.
 *
 * Devuelve `null` si el texto no es un importe válido.
 */
export function parseAmount(
  input: string | number | null | undefined,
  decimalSeparator: DecimalSeparator = ",",
): Cents | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    // Las celdas numéricas de Excel pueden traer 12.339999999; redondeamos a céntimo.
    return roundHalfAwayFromZero(input * 100);
  }

  let s = input.trim().replace(/−/g, "-"); // signo menos tipográfico
  if (s === "") return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  // Quitar moneda y espacios (incluidos no separables).
  s = s.replace(/(EUR|€|USD|\$|GBP|£)/gi, "").replace(/[\s  ]/g, "");
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  } else if (s.endsWith("+")) {
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  // Parte entera: dígitos sin agrupar ("1234") o agrupados de 3 en 3 ("1.234").
  // Un separador de miles mal colocado ("1,2.3") invalida el importe.
  const re =
    decimalSeparator === ","
      ? /^(\d+|\d{1,3}(?:[.']\d{3})+)(?:,(\d+))?$/
      : /^(\d+|\d{1,3}(?:[,']\d{3})+)(?:\.(\d+))?$/;
  const m = re.exec(s);
  if (!m) return null;

  const intPart = (m[1] ?? "0").replace(/[.,']/g, "");
  const fracRaw = m[2] ?? "";
  let cents = Number(intPart) * 100 + Number((fracRaw + "00").slice(0, 2));
  // Más de 2 decimales: redondeo "half away from zero" usando el 3er dígito.
  if (fracRaw.length > 2 && Number(fracRaw[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return negative && cents !== 0 ? -cents : cents;
}

/**
 * Decide el separador decimal de una columna mirando varias muestras.
 * Regla: si aparece "," seguida de 1-2 dígitos al final -> ",".
 * Si aparece "." seguida de 1-2 dígitos al final -> ".".
 * Si no hay evidencia, se usa el valor por defecto (convención española ",").
 */
export function detectDecimalSeparator(
  samples: Array<string | number | null | undefined>,
  fallback: DecimalSeparator = ",",
): DecimalSeparator {
  let comma = 0;
  let dot = 0;
  for (const raw of samples) {
    if (typeof raw !== "string") continue;
    const s = raw.trim().replace(/[\s€a-zA-Z()+\-−]/g, "");
    if (/,\d{1,2}$/.test(s)) comma++;
    else if (/\.\d{1,2}$/.test(s)) dot++;
    // "1.234,5" o "1,234.5": el último separador es el decimal.
    else if (/\.\d{3},\d+$/.test(s)) comma++;
    else if (/,\d{3}\.\d+$/.test(s)) dot++;
  }
  if (comma === 0 && dot === 0) return fallback;
  return comma >= dot ? "," : ".";
}

export function roundHalfAwayFromZero(value: number): number {
  const r = Math.round(Math.abs(value) + Number.EPSILON * Math.abs(value));
  return value < 0 ? -r : r;
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * Porcentaje a/b × 100. Devuelve `null` si no se puede calcular (b = 0):
 * la interfaz debe mostrar "Pendiente de datos", nunca 0 % ni infinito.
 */
export function percentage(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return (numerator / denominator) * 100;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, decimals: number): Intl.NumberFormat {
  const key = `${currency}:${decimals}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      // es-ES por defecto no agrupa 4 cifras ("3450 €"); queremos "3.450 €".
      useGrouping: "always",
    });
    formatters.set(key, f);
  }
  return f;
}

/** 123456 -> "1.234,56 €" */
export function formatMoney(
  cents: Cents,
  opts: { currency?: string; decimals?: 0 | 2; signed?: boolean } = {},
): string {
  const { currency = "EUR", decimals = 2, signed = false } = opts;
  const text = formatter(currency, decimals).format(cents / 100);
  return signed && cents > 0 ? `+${text}` : text;
}

/** 12.345 -> "12,3 %"; null -> "Pendiente de datos" */
export function formatPercent(
  value: number | null,
  opts: { decimals?: number; signed?: boolean } = {},
): string {
  if (value === null) return "Pendiente de datos";
  const { decimals = 1, signed = false } = opts;
  const text = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return `${signed && value > 0 ? "+" : ""}${text} %`;
}

/**
 * Importe tecleado por el usuario en un formulario: admite "45,23", "45.23",
 * "1.234,56" y "1,234.56". El separador se decide con la propia cadena.
 */
export function parseUserAmount(input: string): Cents | null {
  const s = input.trim();
  if (s === "") return null;
  // Un único "." seguido de 1-2 dígitos finales es decimal ("45.5"); si no, convención española.
  const sep = /^[^,]*\.\d{1,2}$/.test(s.replace(/[\s€]/g, "")) ? "." : detectDecimalSeparator([s]);
  return parseAmount(s, sep);
}

/** Céntimos -> "1234,56" (sin símbolo ni miles), para rellenar formularios. */
export function centsToInput(cents: Cents): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
