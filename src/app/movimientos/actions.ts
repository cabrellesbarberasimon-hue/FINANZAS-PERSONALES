"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TxKind } from "@/domain/cashflow";
import type { ActionResult } from "@/lib/action-result";
import { amount, bool, categoryPair, date, str } from "@/lib/form-data";
import { runAction } from "@/server/actions";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { UserError } from "@/server/services/common";
import {
  createManualTransaction,
  deleteTransaction,
  linkTransfer,
  unlinkTransfer,
  updateTransaction,
} from "@/server/services/transactions";

function signedAmount(fd: FormData): number {
  const v = amount(fd, "amount");
  if (v === undefined || v === null || v === 0) throw new UserError("Importe no válido.", { amount: "Importe no válido" });
  const abs = Math.abs(v);
  return str(fd, "direction") === "in" ? abs : -abs;
}

export async function createTransactionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await runAction(async () => {
    const d = date(fd, "date");
    if (!d) throw new UserError("Fecha no válida.", { date: "Fecha no válida" });
    const t = await createManualTransaction(
      db,
      await getCurrentUserId(),
      {
        accountId: str(fd, "accountId") ?? "",
        date: d,
        amount: signedAmount(fd),
        description: str(fd, "description") ?? "",
        ...categoryPair(fd, "category"),
        kind: str(fd, "kind") as TxKind | undefined,
        merchant: str(fd, "merchant"),
        notes: str(fd, "notes"),
        isExtraordinary: bool(fd, "isExtraordinary"),
      },
      { allowDuplicate: bool(fd, "allowDuplicate") },
    );
    id = t.id;
  });
  if (!r?.ok) return r;
  revalidatePath("/", "layout");
  redirect(str(fd, "another") ? "/movimientos/nuevo?creado=1" : `/movimientos/${id}`);
}

export async function updateTransactionAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const editable = str(fd, "editableBankData") === "1";
    const d = editable ? date(fd, "date") : undefined;
    if (editable && !d) throw new UserError("Fecha no válida.", { date: "Fecha no válida" });
    await updateTransaction(db, await getCurrentUserId(), id, {
      descriptionClean: str(fd, "descriptionClean") ?? "",
      merchant: str(fd, "merchant"),
      notes: str(fd, "notes"),
      ...categoryPair(fd, "category"),
      kind: str(fd, "kind") as TxKind | undefined,
      isExtraordinary: bool(fd, "isExtraordinary"),
      reviewed: bool(fd, "reviewed"),
      ...(editable
        ? { date: d ?? undefined, amount: signedAmount(fd), descriptionRaw: str(fd, "descriptionRaw") }
        : {}),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Movimiento guardado." };
  });
}

export async function deleteTransactionAction(id: string, _: ActionResult): Promise<ActionResult> {
  const r = await runAction(async () => deleteTransaction(db, await getCurrentUserId(), id));
  if (!r?.ok) return r;
  revalidatePath("/", "layout");
  redirect("/movimientos");
}

export async function linkTransferAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await linkTransfer(db, await getCurrentUserId(), id, str(fd, "peerId") ?? "");
    revalidatePath("/", "layout");
    return { ok: true, message: "Transferencia interna vinculada." };
  });
}

export async function unlinkTransferAction(id: string, _: ActionResult): Promise<ActionResult> {
  return runAction(async () => {
    await unlinkTransfer(db, await getCurrentUserId(), id);
    revalidatePath("/", "layout");
    return { ok: true, message: "Transferencia desvinculada. Revisa la categoría de ambos movimientos." };
  });
}
