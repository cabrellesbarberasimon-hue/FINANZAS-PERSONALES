import type { TxKind } from "./cashflow";
import { merchantKey, normalizeForHash } from "./text";

/**
 * Motor de reglas de categorización (docs/ARQUITECTURA.md §10). Puro:
 * recibe las reglas y la operación, devuelve la regla ganadora.
 */

export type RuleField = "DESCRIPTION" | "MERCHANT";
export type RuleMatchType = "CONTAINS" | "STARTS_WITH" | "EQUALS" | "REGEX";
export type RuleOrigin = "SYSTEM" | "USER" | "LEARNED";
export type CategoryKind = "EXPENSE" | "INCOME" | "TRANSFER" | "INVESTMENT";

export interface RuleLike {
  id: string;
  field: RuleField;
  matchType: RuleMatchType;
  pattern: string;
  accountId: string | null;
  amountMin: number | null;
  amountMax: number | null;
  categoryId: string;
  subcategoryId: string | null;
  categoryKind: CategoryKind;
  setKind: TxKind | null;
  setMerchant: string | null;
  priority: number;
  origin: RuleOrigin;
  active: boolean;
}

export interface RuleInput {
  accountId: string;
  amount: number;
  description: string;
  merchant: string | null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const regexCache = new Map<string, RegExp | null>();

function compile(rule: Pick<RuleLike, "matchType" | "pattern">): RegExp | null {
  const key = `${rule.matchType}:${rule.pattern}`;
  if (regexCache.has(key)) return regexCache.get(key)!;
  const p = normalizeForHash(rule.pattern);
  let re: RegExp | null = null;
  if (p !== "") {
    try {
      switch (rule.matchType) {
        // Palabra completa: "DIA" coincide con "SUPERMERCADOS DIA" pero no con "MEDIA".
        case "CONTAINS":
          re = new RegExp(`(^|[^A-Z0-9])${escapeRegExp(p)}($|[^A-Z0-9])`);
          break;
        case "STARTS_WITH":
          re = new RegExp(`^${escapeRegExp(p)}`);
          break;
        case "EQUALS":
          re = new RegExp(`^${escapeRegExp(p)}$`);
          break;
        case "REGEX":
          re = new RegExp(rule.pattern, "i");
          break;
      }
    } catch {
      re = null; // regex inválida: nunca coincide
    }
  }
  regexCache.set(key, re);
  return re;
}

export function isValidRulePattern(matchType: RuleMatchType, pattern: string): boolean {
  if (normalizeForHash(pattern) === "") return false;
  return compile({ matchType, pattern }) !== null;
}

export function ruleMatches(rule: RuleLike, tx: RuleInput): boolean {
  if (!rule.active) return false;
  if (rule.accountId && rule.accountId !== tx.accountId) return false;
  const abs = Math.abs(tx.amount);
  if (rule.amountMin !== null && abs < rule.amountMin) return false;
  if (rule.amountMax !== null && abs > rule.amountMax) return false;
  // Una categoría de ingresos nunca se aplica a una salida de dinero.
  const kind = rule.setKind ?? rule.categoryKind;
  if (kind === "INCOME" && tx.amount < 0) return false;
  // MERCHANT = clave de comercio calculada de la descripción (determinista, la
  // misma que usa el aprendizaje), no el campo "comercio" editable.
  const text = rule.field === "MERCHANT" ? merchantKey(tx.description) : tx.description;
  const re = compile(rule);
  if (!re) return false;
  return re.test(rule.matchType === "REGEX" ? text : normalizeForHash(text));
}

const ORIGIN_RANK: Record<RuleOrigin, number> = { USER: 2, LEARNED: 2, SYSTEM: 0 };

/** Orden de evaluación: reglas del usuario > prioridad > patrón más específico. */
export function sortRules<T extends RuleLike>(rules: T[]): T[] {
  return [...rules].sort(
    (a, b) =>
      ORIGIN_RANK[b.origin] - ORIGIN_RANK[a.origin] ||
      b.priority - a.priority ||
      b.pattern.length - a.pattern.length ||
      a.id.localeCompare(b.id),
  );
}

/** Primera regla que coincide (las reglas deben venir ordenadas con sortRules). */
export function findMatchingRule<T extends RuleLike>(sortedRules: T[], tx: RuleInput): T | null {
  return sortedRules.find((r) => ruleMatches(r, tx)) ?? null;
}
