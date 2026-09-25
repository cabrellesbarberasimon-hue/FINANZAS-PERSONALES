"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { amount, date, str } from "@/lib/form-data";
import { runAction } from "@/server/actions";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { UserError } from "@/server/services/common";
import {
  addInvestmentPrice,
  addInvestmentTransaction,
  createInvestment,
  deleteInvestment,
  deleteInvestmentPrice,
  deleteInvestmentTransaction,
  setInvestmentArchived,
  updateInvestment,
  type InvestmentInput,
} from "@/server/services/investments";

function investmentFromForm(fd: FormData): InvestmentInput {
  return {
    name: str(fd, "name") ?? "",
    assetType: (str(fd, "assetType") ?? "INDEX_FUND") as InvestmentInput["assetType"],
    isin: str(fd, "isin"),
    ticker: str(fd, "ticker"),
    platform: str(fd, "platform"),
    accountId: str(fd, "accountId"),
    currency: str(fd, "currency") ?? "EUR",
    valuationMode: str(fd, "valuationMode") === "TOTAL_VALUE" ? "TOTAL_VALUE" : "UNITS",
    notes: str(fd, "notes"),
  };
}

function requireDate(fd: FormData, key = "date"): Date {
  const d = date(fd, key);
  if (!d) throw new UserError("Fecha no válida.", { [key]: "Fecha no válida" });
  return d;
}

function money(fd: FormData, key: string, required: boolean): number | null {
  const v = amount(fd, key);
  if (v === null || (required && v === undefined)) throw new UserError("Importe no válido.", { [key]: "Importe no válido" });
  return v === undefined ? null : Math.abs(v);
}

export async function createInvestmentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await runAction(async () => {
    id = (await createInvestment(db, await getCurrentUserId(), investmentFromForm(fd))).id;
  });
  if (!r?.ok) return r;
  revalidatePath("/", "layout");
  redirect(`/inversiones/${id}`);
}

export async function updateInvestmentAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await updateInvestment(db, await getCurrentUserId(), id, investmentFromForm(fd));
    revalidatePath("/", "layout");
    return { ok: true, message: "Inversión actualizada." };
  });
}

export async function archiveInvestmentAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await setInvestmentArchived(db, await getCurrentUserId(), id, str(fd, "archived") === "true");
    revalidatePath("/", "layout");
  });
}

export async function deleteInvestmentAction(id: string, _: ActionResult): Promise<ActionResult> {
  const r = await runAction(async () => deleteInvestment(db, await getCurrentUserId(), id));
  if (!r?.ok) return r;
  revalidatePath("/", "layout");
  redirect("/inversiones");
}

export async function addOperationAction(investmentId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await addInvestmentTransaction(db, await getCurrentUserId(), investmentId, {
      type: (str(fd, "type") ?? "BUY") as "BUY",
      date: requireDate(fd),
      amount: money(fd, "amount", true)!,
      fees: money(fd, "fees", false) ?? 0,
      units: str(fd, "units"),
      price: str(fd, "price"),
      cashTransactionId: str(fd, "cashTransactionId"),
      notes: str(fd, "notes"),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Operación registrada." };
  });
}

export async function deleteOperationAction(id: string, _: ActionResult): Promise<ActionResult> {
  return runAction(async () => {
    await deleteInvestmentTransaction(db, await getCurrentUserId(), id);
    revalidatePath("/", "layout");
  });
}

export async function addPriceAction(investmentId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await addInvestmentPrice(db, await getCurrentUserId(), investmentId, {
      date: requireDate(fd),
      price: str(fd, "price"),
      totalValue: money(fd, "totalValue", false),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Valoración registrada." };
  });
}

export async function deletePriceAction(id: string, _: ActionResult): Promise<ActionResult> {
  return runAction(async () => {
    await deleteInvestmentPrice(db, await getCurrentUserId(), id);
    revalidatePath("/", "layout");
  });
}
