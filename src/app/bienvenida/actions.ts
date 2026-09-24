"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { str } from "@/lib/form-data";
import { runAction } from "@/server/actions";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { finishOnboarding, markOnboardingStep, type OnboardingStepKey } from "@/server/services/onboarding";

const KEYS: OnboardingStepKey[] = ["accounts", "balances", "investments", "import", "categories"];

export async function markStepAction(key: OnboardingStepKey, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    if (!KEYS.includes(key)) return { ok: false, error: "Paso desconocido." };
    const op = str(fd, "op");
    await markOnboardingStep(db, await getCurrentUserId(), key, op === "skip" ? "skip" : op === "reset" ? "reset" : "confirm");
    revalidatePath("/", "layout");
  });
}

export async function finishOnboardingAction(_: ActionResult): Promise<ActionResult> {
  const r = await runAction(async () => finishOnboarding(db, await getCurrentUserId()));
  if (!r?.ok) return r;
  revalidatePath("/", "layout");
  redirect("/");
}
