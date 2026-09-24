import Papa from "papaparse";
import type { Cell, RawTable, StatementParser } from "../types";

/**
 * Decodifica texto: UTF-8 si es válido (quitando BOM); si no, Windows-1252,
 * la codificación habitual de los CSV de bancos españoles.
 */
export function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ""), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

/** Delimitador más consistente en las primeras líneas. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 30);
  let best = ";";
  let bestScore = -1;
  for (const d of [";", ",", "\t", "|"]) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const max = Math.max(0, ...counts);
    if (max === 0) continue;
    // Puntuación: nº de líneas con el número de columnas más frecuente.
    const freq = new Map<number, number>();
    for (const c of counts) if (c > 0) freq.set(c, (freq.get(c) ?? 0) + 1);
    const [cols, times] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [0, 0];
    const score = times * 100 + cols;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 4096);
  let zeros = 0;
  for (let i = 0; i < n; i++) if (bytes[i] === 0) zeros++;
  return zeros > 0;
}

export const csvParser: StatementParser = {
  kind: "csv",
  canParse(bytes) {
    if (bytes.length === 0 || looksBinary(bytes)) return false;
    const head = decodeText(bytes.slice(0, 2048)).text.trimStart().toLowerCase();
    // Algunos bancos exportan HTML con extensión .xls: no es CSV.
    return !head.startsWith("<");
  },
  async parse(bytes) {
    const { text, encoding } = decodeText(bytes);
    const delimiter = detectDelimiter(text);
    const result = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: false });
    const rows: Cell[][] = result.data.map((r) => r.map((c) => (c.trim() === "" ? null : c.trim())));
    return { rows, meta: { encoding, delimiter: delimiter === "\t" ? "tab" : delimiter } };
  },
};
