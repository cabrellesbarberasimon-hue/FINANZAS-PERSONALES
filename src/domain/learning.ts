import { findMatchingRule, type RuleLike } from "./rules";

/**
 * Aprendizaje de reglas (docs/ARQUITECTURA.md §10): si el usuario corrige
 * varias veces la misma clave de comercio a la misma categoría y ninguna
 * regla lo cubre, se le sugiere crear una regla.
 */

export const SUGGESTION_THRESHOLD = 3;

export interface Correction {
  merchantKey: string;
  categoryId: string;
  subcategoryId: string | null;
  dismissed: boolean;
  createdAt: Date;
}

export interface RuleSuggestion {
  merchantKey: string;
  categoryId: string;
  subcategoryId: string | null;
  /** Nº de correcciones que la respaldan. */
  count: number;
  lastCorrection: Date;
}

export function suggestRules(
  corrections: Correction[],
  sortedRules: RuleLike[],
  threshold = SUGGESTION_THRESHOLD,
): RuleSuggestion[] {
  // Clave de comercio descartada por el usuario: no se vuelve a sugerir hacia esa categoría.
  const dismissed = new Set(
    corrections.filter((c) => c.dismissed).map((c) => `${c.merchantKey}|${c.categoryId}|${c.subcategoryId ?? ""}`),
  );
  const groups = new Map<string, RuleSuggestion>();
  for (const c of corrections) {
    if (c.dismissed || !c.merchantKey) continue;
    const key = `${c.merchantKey}|${c.categoryId}|${c.subcategoryId ?? ""}`;
    if (dismissed.has(key)) continue;
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (c.createdAt > g.lastCorrection) g.lastCorrection = c.createdAt;
    } else {
      groups.set(key, { merchantKey: c.merchantKey, categoryId: c.categoryId, subcategoryId: c.subcategoryId, count: 1, lastCorrection: c.createdAt });
    }
  }

  // Por clave de comercio, solo la categoría más corregida (y que supere el umbral).
  const best = new Map<string, RuleSuggestion>();
  for (const g of groups.values()) {
    if (g.count < threshold) continue;
    const cur = best.get(g.merchantKey);
    if (!cur || g.count > cur.count || (g.count === cur.count && g.lastCorrection > cur.lastCorrection)) {
      best.set(g.merchantKey, g);
    }
  }

  // Descarta las que una regla del usuario ya resuelve con esa misma categoría.
  const userRules = sortedRules.filter((r) => r.origin !== "SYSTEM");
  return [...best.values()]
    .filter((s) => {
      const hit = findMatchingRule(userRules, { accountId: "", amount: -1, description: s.merchantKey, merchant: s.merchantKey });
      return !(hit && hit.categoryId === s.categoryId && (hit.subcategoryId ?? null) === s.subcategoryId);
    })
    .sort((a, b) => b.count - a.count || b.lastCorrection.getTime() - a.lastCorrection.getTime());
}
