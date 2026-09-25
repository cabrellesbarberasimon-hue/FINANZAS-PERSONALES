"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { str } from "@/lib/form-data";
import { runAction } from "@/server/actions";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { confirmDuplicate, resolveFlag } from "@/server/services/review";
import { linkTransfer } from "@/server/services/transactions";

export async function resolveFlagAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const decision = str(fd, "decision") === "resolve" ? "resolve" : "dismiss";
    await resolveFlag(db, await getCurrentUserId(), id, decision, str(fd, "resolution") ?? "");
    revalidatePath("/", "layout");
  });
}

export async function confirmDuplicateAction(id: string, _: ActionResult): Promise<ActionResult> {
  return runAction(async () => {
    await confirmDuplicate(db, await getCurrentUserId(), id);
    revalidatePath("/", "layout");
  });
}

export async function linkFromFlagAction(txId: string, peerId: string, _: ActionResult): Promise<ActionResult> {
  return runAction(async () => {
    await linkTransfer(db, await getCurrentUserId(), txId, peerId);
    revalidatePath("/", "layout");
  });
}
