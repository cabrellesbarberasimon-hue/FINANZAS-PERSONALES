"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { amount, date, str } from "@/lib/form-data";
import { runAction } from "@/server/actions";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import {
  addDeclaredBalance,
  createAccount,
  deleteAccount,
  deleteDeclaredBalance,
  setAccountArchived,
  updateAccount,
  type AccountInput,
} from "@/server/services/accounts";
import { UserError } from "@/server/services/common";
import {
  addLiabilityBalance,
  createLiability,
  deleteLiabilityBalance,
  setLiabilityArchived,
  updateLiability,
  type LiabilityInput,
} from "@/server/services/liabilities";

function requireAmount(fd: FormData, key: string, label: string): number {
  const v = amount(fd, key);
  if (v === undefined || v === null) throw new UserError(`${label}: importe no válido.`, { [key]: "Importe no válido" });
  return v;
}

function requireDate(fd: FormData, key: string): Date {
  const v = date(fd, key);
  if (!v) throw new UserError("Fecha no válida.", { [key]: "Fecha no válida" });
  return v;
}

function accountFromForm(fd: FormData): AccountInput {
  return {
    name: str(fd, "name") ?? "",
    institution: str(fd, "institution"),
    type: (str(fd, "type") ?? "CHECKING") as AccountInput["type"],
    currency: str(fd, "currency") ?? "EUR",
    identifier: str(fd, "identifier"),
    notes: str(fd, "notes"),
    openingBalance: requireAmount(fd, "openingBalance", "Saldo inicial"),
    openingDate: requireDate(fd, "openingDate"),
  };
}

export async function createAccountAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await runAction(async () => {
    const acc = await createAccount(db, await getCurrentUserId(), accountFromForm(fd));
    id = acc.id;
  });
  if (!r?.ok) return r;
  revalidatePath("/", "layout");
  redirect(str(fd, "next") === "wizard" ? "/bienvenida" : `/cuentas/${id}`);
}

export async function updateAccountAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await updateAccount(db, await getCurrentUserId(), id, accountFromForm(fd));
    revalidatePath("/", "layout");
    return { ok: true, message: "Cuenta actualizada." };
  });
}

export async function archiveAccountAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await setAccountArchived(db, await getCurrentUserId(), id, str(fd, "archived") === "true");
    revalidatePath("/", "layout");
  });
}

export async function deleteAccountAction(id: string, _: ActionResult): Promise<ActionResult> {
  const r = await runAction(async () => deleteAccount(db, await getCurrentUserId(), id));
  if (!r?.ok) return r;
  revalidatePath("/", "layout");
  redirect("/cuentas");
}

export async function addDeclaredBalanceAction(accountId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await addDeclaredBalance(db, await getCurrentUserId(), accountId, {
      date: requireDate(fd, "date"),
      balance: requireAmount(fd, "balance", "Saldo"),
      notes: str(fd, "notes"),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Saldo registrado." };
  });
}

export async function deleteDeclaredBalanceAction(balanceId: string, _: ActionResult): Promise<ActionResult> {
  return runAction(async () => {
    await deleteDeclaredBalance(db, await getCurrentUserId(), balanceId);
    revalidatePath("/", "layout");
  });
}

// --- Pasivos -----------------------------------------------------------------

function optionalAmount(fd: FormData, key: string): number | null {
  const v = amount(fd, key);
  if (v === null) throw new UserError("Importe no válido.", { [key]: "Importe no válido" });
  return v ?? null;
}

function liabilityFromForm(fd: FormData): LiabilityInput {
  const rate = str(fd, "interestRate");
  const parsedRate = rate ? Number(rate.replace(",", ".")) : null;
  if (rate && !Number.isFinite(parsedRate)) throw new UserError("Tipo de interés no válido.", { interestRate: "No válido" });
  return {
    name: str(fd, "name") ?? "",
    type: (str(fd, "type") ?? "LOAN") as LiabilityInput["type"],
    lender: str(fd, "lender"),
    originalAmount: optionalAmount(fd, "originalAmount"),
    interestRate: parsedRate,
    startDate: date(fd, "startDate") ?? null,
    endDate: date(fd, "endDate") ?? null,
    monthlyPayment: optionalAmount(fd, "monthlyPayment"),
    paymentAccountId: str(fd, "paymentAccountId"),
    notes: str(fd, "notes"),
  };
}

export async function createLiabilityAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await runAction(async () => {
    const pending = optionalAmount(fd, "currentBalance");
    const l = await createLiability(
      db,
      await getCurrentUserId(),
      liabilityFromForm(fd),
      pending === null ? undefined : { date: requireDate(fd, "currentBalanceDate"), balance: pending },
    );
    id = l.id;
  });
  if (!r?.ok) return r;
  revalidatePath("/", "layout");
  redirect(`/cuentas/pasivos/${id}`);
}

export async function updateLiabilityAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await updateLiability(db, await getCurrentUserId(), id, liabilityFromForm(fd));
    revalidatePath("/", "layout");
    return { ok: true, message: "Deuda actualizada." };
  });
}

export async function archiveLiabilityAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await setLiabilityArchived(db, await getCurrentUserId(), id, str(fd, "archived") === "true");
    revalidatePath("/", "layout");
  });
}

export async function addLiabilityBalanceAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await addLiabilityBalance(db, await getCurrentUserId(), id, {
      date: requireDate(fd, "date"),
      balance: requireAmount(fd, "balance", "Deuda pendiente"),
      notes: str(fd, "notes"),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Saldo de deuda registrado." };
  });
}

export async function deleteLiabilityBalanceAction(balanceId: string, _: ActionResult): Promise<ActionResult> {
  return runAction(async () => {
    await deleteLiabilityBalance(db, await getCurrentUserId(), balanceId);
    revalidatePath("/", "layout");
  });
}
