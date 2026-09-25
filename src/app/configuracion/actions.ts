"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CategoryKind } from "@/generated/prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { amount, bool, categoryPair, str } from "@/lib/form-data";
import { runAction } from "@/server/actions";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import {
  createCategory,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
  renameSubcategory,
  setCategoryArchived,
  setSubcategoryArchived,
  updateCategory,
} from "@/server/services/categories";
import { UserError } from "@/server/services/common";
import { deleteImportProfile } from "@/server/services/imports";
import {
  acceptSuggestion,
  applyRules,
  createRule,
  deleteRule,
  dismissSuggestion,
  previewRule,
  setRuleActive,
  updateRule,
  type RuleInput,
} from "@/server/services/rules";
import { detectTransfers } from "@/server/services/transfer-detection";

const done = (message?: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

// --- Categorías ----------------------------------------------------------------

export async function createCategoryAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await createCategory(db, await getCurrentUserId(), { name: str(fd, "name") ?? "", kind: (str(fd, "kind") ?? "EXPENSE") as CategoryKind });
    return done("Categoría creada.");
  });
}

export async function renameCategoryAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await updateCategory(db, await getCurrentUserId(), id, { name: str(fd, "name") ?? "" });
    return done("Guardado.");
  });
}

export async function archiveCategoryAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await setCategoryArchived(db, await getCurrentUserId(), id, str(fd, "archived") === "true");
    return done();
  });
}

export async function deleteCategoryAction(id: string, _: ActionResult): Promise<ActionResult> {
  return runAction(async () => {
    await deleteCategory(db, await getCurrentUserId(), id);
    return done();
  });
}

export async function createSubcategoryAction(categoryId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await createSubcategory(db, await getCurrentUserId(), categoryId, { name: str(fd, "name") ?? "" });
    return done();
  });
}

export async function renameSubcategoryAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await renameSubcategory(db, await getCurrentUserId(), id, { name: str(fd, "name") ?? "" });
    return done("Guardado.");
  });
}

export async function archiveSubcategoryAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await setSubcategoryArchived(db, await getCurrentUserId(), id, str(fd, "archived") === "true");
    return done();
  });
}

export async function deleteSubcategoryAction(id: string, _: ActionResult): Promise<ActionResult> {
  return runAction(async () => {
    await deleteSubcategory(db, await getCurrentUserId(), id);
    return done();
  });
}

// --- Reglas --------------------------------------------------------------------

function optionalAbsAmount(fd: FormData, key: string): number | null {
  const v = amount(fd, key);
  if (v === null) throw new UserError("Importe no válido.", { [key]: "No válido" });
  return v === undefined ? null : Math.abs(v);
}

function ruleFromForm(fd: FormData): RuleInput {
  const { categoryId, subcategoryId } = categoryPair(fd, "category");
  return {
    name: str(fd, "name"),
    field: str(fd, "field") === "MERCHANT" ? "MERCHANT" : "DESCRIPTION",
    matchType: (str(fd, "matchType") ?? "CONTAINS") as RuleInput["matchType"],
    pattern: str(fd, "pattern") ?? "",
    accountId: str(fd, "accountId"),
    amountMin: optionalAbsAmount(fd, "amountMin"),
    amountMax: optionalAbsAmount(fd, "amountMax"),
    categoryId: categoryId ?? "",
    subcategoryId,
    priority: Number(str(fd, "priority") ?? 0) || 0,
    active: str(fd, "active") !== "off",
  };
}

async function describePreview(fd: FormData): Promise<ActionResult> {
  const p = await previewRule(db, await getCurrentUserId(), ruleFromForm(fd));
  const sample = [...new Set(p.sample.map((s) => s.descriptionRaw))].slice(0, 5).join(" · ");
  return {
    ok: true,
    message:
      p.total === 0
        ? "No coincide con ningún movimiento actual."
        : `Coincide con ${p.total} movimiento(s): ${p.uncategorized} sin categoría` +
          (p.manual ? `, ${p.manual} categorizados a mano (no se tocarán)` : "") +
          `. Ejemplos: ${sample}`,
  };
}

export async function saveRuleAction(id: string | null, _: ActionResult, fd: FormData): Promise<ActionResult> {
  if (str(fd, "op") === "preview") return runAction(() => describePreview(fd));
  const r = await runAction(async () => {
    const userId = await getCurrentUserId();
    if (id) await updateRule(db, userId, id, ruleFromForm(fd));
    else await createRule(db, userId, ruleFromForm(fd));
    if (bool(fd, "applyNow")) await applyRules(db, userId, id ? "automatic" : "uncategorized");
  });
  if (!r?.ok) return r;
  revalidatePath("/", "layout");
  redirect("/configuracion/reglas?guardada=1");
}

export async function toggleRuleAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await setRuleActive(db, await getCurrentUserId(), id, str(fd, "active") === "true");
    return done();
  });
}

export async function deleteRuleAction(id: string, _: ActionResult): Promise<ActionResult> {
  const r = await runAction(async () => deleteRule(db, await getCurrentUserId(), id));
  if (!r?.ok) return r;
  revalidatePath("/", "layout");
  redirect("/configuracion/reglas");
}

export async function applyRulesAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const scope = str(fd, "scope") === "automatic" ? "automatic" : "uncategorized";
    const r = await applyRules(db, await getCurrentUserId(), scope);
    return done(r.changed ? `${r.changed} movimiento(s) categorizados.` : "Ningún movimiento ha cambiado.");
  });
}

function suggestionFromForm(fd: FormData) {
  return {
    merchantKey: str(fd, "merchantKey") ?? "",
    categoryId: str(fd, "categoryId") ?? "",
    subcategoryId: str(fd, "subcategoryId") ?? null,
  };
}

export async function acceptSuggestionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { applied } = await acceptSuggestion(db, await getCurrentUserId(), suggestionFromForm(fd));
    return done(`Regla creada. ${applied.changed} movimiento(s) categorizados.`);
  });
}

export async function dismissSuggestionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await dismissSuggestion(db, await getCurrentUserId(), suggestionFromForm(fd));
    return done("Sugerencia descartada.");
  });
}

export async function detectTransfersAction(_: ActionResult): Promise<ActionResult> {
  return runAction(async () => {
    const r = await detectTransfers(db, await getCurrentUserId());
    return done(`${r.linked} transferencia(s) vinculadas automáticamente; ${r.flagged} pendientes de revisar.`);
  });
}

// --- Formatos de importación ----------------------------------------------------

export async function deleteProfileAction(id: string, _: ActionResult): Promise<ActionResult> {
  return runAction(async () => {
    await deleteImportProfile(db, await getCurrentUserId(), id);
    return done();
  });
}
