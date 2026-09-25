import { z } from "zod";
import { suggestRules, type RuleSuggestion } from "@/domain/learning";
import { findMatchingRule, isValidRulePattern, sortRules, type RuleLike } from "@/domain/rules";
import { merchantKey } from "@/domain/text";
import { TX_KINDS } from "@/domain/transactions";
import type { TxKind } from "@/domain/cashflow";
import type { CategorizationRule } from "@/generated/prisma/client";
import { inTransaction, UserError, writeAudit, type Db } from "./common";

export type LoadedRule = RuleLike & { label: string };

/** Reglas activas ordenadas por precedencia, listas para el motor. */
export async function loadSortedRules(db: Db, userId: string, opts: { includeInactive?: boolean } = {}): Promise<LoadedRule[]> {
  const rules = await db.categorizationRule.findMany({
    where: { userId, ...(opts.includeInactive ? {} : { active: true }) },
    include: { category: { select: { kind: true, name: true } }, subcategory: { select: { name: true } } },
  });
  return sortRules(
    rules.map((r) => ({
      ...r,
      categoryKind: r.category.kind,
      label: `${r.category.name}${r.subcategory ? ` / ${r.subcategory.name}` : ""}`,
    })),
  );
}

export async function listRules(db: Db, userId: string) {
  return db.categorizationRule.findMany({
    where: { userId },
    orderBy: [{ origin: "asc" }, { active: "desc" }, { pattern: "asc" }],
    include: {
      category: { select: { name: true } },
      subcategory: { select: { name: true } },
      account: { select: { name: true } },
    },
  });
}

// -----------------------------------------------------------------------------
// CRUD
// -----------------------------------------------------------------------------

export const ruleInputSchema = z
  .object({
    name: z.string().trim().max(80).optional().transform((v) => v || null),
    field: z.enum(["DESCRIPTION", "MERCHANT"]).default("DESCRIPTION"),
    matchType: z.enum(["CONTAINS", "STARTS_WITH", "EQUALS", "REGEX"]).default("CONTAINS"),
    pattern: z.string().trim().min(1, "Escribe el texto a buscar").max(200),
    accountId: z.string().optional().transform((v) => v || null),
    amountMin: z.number().int().min(0).nullable().default(null),
    amountMax: z.number().int().min(0).nullable().default(null),
    categoryId: z.string().min(1, "Elige una categoría"),
    subcategoryId: z.string().optional().transform((v) => v || null),
    setKind: z.enum(TX_KINDS as [TxKind, ...TxKind[]]).nullable().default(null),
    priority: z.number().int().min(-100).max(100).default(0),
    active: z.boolean().default(true),
  })
  .refine((r) => isValidRulePattern(r.matchType, r.pattern), { message: "Patrón no válido", path: ["pattern"] })
  .refine((r) => r.amountMin === null || r.amountMax === null || r.amountMin <= r.amountMax, {
    message: "El mínimo supera al máximo",
    path: ["amountMin"],
  });
export type RuleInput = z.input<typeof ruleInputSchema>;

async function validateRefs(db: Db, userId: string, data: z.output<typeof ruleInputSchema>) {
  const cat = await db.category.findFirst({ where: { id: data.categoryId, userId } });
  if (!cat) throw new UserError("La categoría no existe.", { categoryId: "No válida" });
  if (data.subcategoryId && !(await db.subcategory.findFirst({ where: { id: data.subcategoryId, categoryId: cat.id } }))) {
    throw new UserError("La subcategoría no pertenece a la categoría.");
  }
  if (data.accountId && !(await db.account.findFirst({ where: { id: data.accountId, userId } }))) {
    throw new UserError("La cuenta no existe.");
  }
}

function parseRule(input: RuleInput) {
  const r = ruleInputSchema.safeParse(input);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of r.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    throw new UserError(Object.values(fieldErrors)[0] ?? "Regla no válida.", fieldErrors);
  }
  return r.data;
}

export async function createRule(
  db: Db,
  userId: string,
  input: RuleInput,
  origin: "USER" | "LEARNED" = "USER",
): Promise<CategorizationRule> {
  const data = parseRule(input);
  await validateRefs(db, userId, data);
  return inTransaction(db, async (tx) => {
    const rule = await tx.categorizationRule.create({ data: { ...data, userId, origin } });
    await writeAudit(tx, { userId, entity: "CategorizationRule", entityId: rule.id, action: "create", after: rule });
    return rule;
  });
}

export async function updateRule(db: Db, userId: string, id: string, input: RuleInput) {
  const data = parseRule(input);
  await validateRefs(db, userId, data);
  return inTransaction(db, async (tx) => {
    const before = await tx.categorizationRule.findFirst({ where: { id, userId } });
    if (!before) throw new UserError("La regla no existe.");
    const after = await tx.categorizationRule.update({ where: { id }, data });
    await writeAudit(tx, { userId, entity: "CategorizationRule", entityId: id, action: "update", before, after });
    return after;
  });
}

export async function setRuleActive(db: Db, userId: string, id: string, active: boolean) {
  const r = await db.categorizationRule.updateMany({ where: { id, userId }, data: { active } });
  if (r.count === 0) throw new UserError("La regla no existe.");
}

/** Borrar una regla no descategoriza nada: los movimientos conservan su categoría. */
export async function deleteRule(db: Db, userId: string, id: string) {
  await inTransaction(db, async (tx) => {
    const before = await tx.categorizationRule.findFirst({ where: { id, userId } });
    if (!before) throw new UserError("La regla no existe.");
    await tx.categorizationRule.delete({ where: { id } });
    await writeAudit(tx, { userId, entity: "CategorizationRule", entityId: id, action: "delete", before });
  });
}

// -----------------------------------------------------------------------------
// Aplicar reglas
// -----------------------------------------------------------------------------

type Candidate = {
  id: string;
  accountId: string;
  amount: number;
  descriptionRaw: string;
  merchant: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  ruleId: string | null;
  kind: TxKind;
  categorizationSource: "NONE" | "RULE" | "MANUAL" | "IMPORT";
};

/**
 * Movimientos que las reglas pueden (re)categorizar: nunca los categorizados
 * a mano ni las transferencias vinculadas.
 */
async function candidates(db: Db, userId: string, scope: "uncategorized" | "automatic"): Promise<Candidate[]> {
  return db.transaction.findMany({
    where: {
      userId,
      transferPeerId: null,
      ...(scope === "uncategorized"
        ? { categoryId: null, categorizationSource: { not: "MANUAL" } }
        : { categorizationSource: { in: ["NONE", "RULE"] } }),
    },
    select: {
      id: true, accountId: true, amount: true, descriptionRaw: true, merchant: true,
      categoryId: true, subcategoryId: true, ruleId: true, kind: true, categorizationSource: true,
    },
  });
}

/** Cuántos movimientos (y cuáles) coincidirían con una regla. */
export async function previewRule(db: Db, userId: string, input: RuleInput) {
  const data = parseRule(input);
  const cat = await db.category.findFirst({ where: { id: data.categoryId, userId } });
  if (!cat) throw new UserError("La categoría no existe.");
  const rule: RuleLike = { ...data, id: "preview", categoryKind: cat.kind, setMerchant: null, origin: "USER" };
  const all = await db.transaction.findMany({
    where: { userId },
    select: { id: true, accountId: true, amount: true, descriptionRaw: true, merchant: true, categorizationSource: true, categoryId: true, date: true },
    orderBy: { date: "desc" },
  });
  const matches = all.filter((t) => findMatchingRule([rule], { accountId: t.accountId, amount: t.amount, description: t.descriptionRaw, merchant: t.merchant }));
  return {
    total: matches.length,
    uncategorized: matches.filter((m) => m.categoryId === null).length,
    manual: matches.filter((m) => m.categorizationSource === "MANUAL").length,
    sample: matches.slice(0, 8),
  };
}

export interface ApplyResult {
  examined: number;
  changed: number;
}

/**
 * Aplica las reglas activas.
 * - "uncategorized": solo a movimientos sin categoría.
 * - "automatic": también recalcula los categorizados por reglas (tras editar reglas).
 * Los cambios quedan en un único registro de auditoría con el estado anterior.
 */
export async function applyRules(
  db: Db,
  userId: string,
  scope: "uncategorized" | "automatic",
  opts: { onlyIds?: string[] } = {},
): Promise<ApplyResult> {
  return inTransaction(db, async (tx) => {
    const rules = await loadSortedRules(tx, userId);
    let list = await candidates(tx, userId, scope);
    if (opts.onlyIds) {
      const only = new Set(opts.onlyIds);
      list = list.filter((t) => only.has(t.id));
    }
    const changes: Array<{ id: string; before: Partial<Candidate> }> = [];
    const use = new Map<string, number>();
    for (const t of list) {
      const rule = findMatchingRule(rules, { accountId: t.accountId, amount: t.amount, description: t.descriptionRaw, merchant: t.merchant });
      const target = rule
        ? { categoryId: rule.categoryId, subcategoryId: rule.subcategoryId, ruleId: rule.id, kind: rule.setKind ?? rule.categoryKind }
        : scope === "automatic" && t.categorizationSource === "RULE"
          ? { categoryId: null, subcategoryId: null, ruleId: null, kind: (t.amount >= 0 ? "INCOME" : "EXPENSE") as TxKind }
          : null;
      if (!target) continue;
      const unchanged =
        target.categoryId === t.categoryId && target.subcategoryId === t.subcategoryId && target.ruleId === t.ruleId;
      if (unchanged && (target.ruleId !== null || t.categorizationSource !== "RULE")) continue;
      await tx.transaction.update({
        where: { id: t.id },
        data: {
          ...target,
          categorizationSource: target.ruleId ? "RULE" : "NONE",
          ...(target.ruleId ? {} : { reviewed: false }),
        },
      });
      changes.push({ id: t.id, before: { categoryId: t.categoryId, subcategoryId: t.subcategoryId, ruleId: t.ruleId, kind: t.kind } });
      if (target.ruleId) use.set(target.ruleId, (use.get(target.ruleId) ?? 0) + 1);
    }
    for (const [ruleId, n] of use) {
      await tx.categorizationRule.update({ where: { id: ruleId }, data: { timesApplied: { increment: n } } });
    }
    if (changes.length > 0) {
      await writeAudit(tx, { userId, entity: "Rules", entityId: "apply", action: "update", before: changes, after: { scope, changed: changes.length } });
    }
    return { examined: list.length, changed: changes.length };
  });
}

// -----------------------------------------------------------------------------
// Aprendizaje
// -----------------------------------------------------------------------------

export interface SuggestionView extends RuleSuggestion {
  label: string;
  /** Movimientos sin categoría a los que se aplicaría. */
  affected: number;
}

export async function getRuleSuggestions(db: Db, userId: string, opts: { merchantKey?: string } = {}): Promise<SuggestionView[]> {
  const [corrections, rules] = await Promise.all([
    db.categorizationCorrection.findMany({
      where: { userId, ...(opts.merchantKey ? { merchantKey: opts.merchantKey } : {}) },
      select: { merchantKey: true, categoryId: true, subcategoryId: true, dismissed: true, createdAt: true },
    }),
    loadSortedRules(db, userId),
  ]);
  const suggestions = suggestRules(corrections, rules);
  if (suggestions.length === 0) return [];
  const cats = await db.category.findMany({ where: { userId }, include: { subcategories: true } });
  const uncategorized = await db.transaction.findMany({
    where: { userId, categoryId: null, transferPeerId: null },
    select: { descriptionRaw: true },
  });
  return suggestions.map((s) => {
    const c = cats.find((x) => x.id === s.categoryId);
    const sub = c?.subcategories.find((x) => x.id === s.subcategoryId);
    return {
      ...s,
      label: c ? `${c.name}${sub ? ` / ${sub.name}` : ""}` : "(categoría eliminada)",
      affected: uncategorized.filter((t) => merchantKey(t.descriptionRaw) === s.merchantKey).length,
    };
  });
}

/** Crea la regla aprendida y la aplica a los movimientos sin categoría. */
export async function acceptSuggestion(
  db: Db,
  userId: string,
  s: { merchantKey: string; categoryId: string; subcategoryId: string | null },
): Promise<{ rule: CategorizationRule; applied: ApplyResult }> {
  return inTransaction(db, async (tx) => {
    const rule = await createRule(
      tx,
      userId,
      { pattern: s.merchantKey, matchType: "EQUALS", field: "MERCHANT", categoryId: s.categoryId, subcategoryId: s.subcategoryId ?? undefined, name: `Aprendida: ${s.merchantKey}` },
      "LEARNED",
    );
    const applied = await applyRules(tx, userId, "uncategorized");
    return { rule, applied };
  });
}

export async function dismissSuggestion(
  db: Db,
  userId: string,
  s: { merchantKey: string; categoryId: string; subcategoryId: string | null },
) {
  await db.categorizationCorrection.updateMany({
    where: { userId, merchantKey: s.merchantKey, categoryId: s.categoryId, subcategoryId: s.subcategoryId },
    data: { dismissed: true },
  });
}
