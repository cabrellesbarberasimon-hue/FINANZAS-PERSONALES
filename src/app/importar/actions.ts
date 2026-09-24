"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DateFormat } from "@/domain/dates";
import { today } from "@/domain/dates";
import type { ActionResult } from "@/lib/action-result";
import { bool, str } from "@/lib/form-data";
import { runAction } from "@/server/actions";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { MAX_FILE_BYTES } from "@/server/import/parsers";
import type { ImportConfig } from "@/server/import/types";
import { UserError } from "@/server/services/common";
import {
  commitImport,
  createImportFromUpload,
  discardPreview,
  getMappingStep,
  reopenMapping,
  revertImport,
  saveImportConfig,
} from "@/server/services/imports";

export async function uploadStatementAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  let repeated = false;
  const r = await runAction(async () => {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Selecciona un fichero.", { file: "Obligatorio" });
    if (file.size > MAX_FILE_BYTES) throw new UserError("El fichero supera 5 MB.", { file: "Demasiado grande" });
    const { imp, previous } = await createImportFromUpload(db, await getCurrentUserId(), {
      accountId: str(fd, "accountId") ?? "",
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    id = imp.id;
    repeated = previous !== null;
  });
  if (!r?.ok) return r;
  revalidatePath("/importar");
  redirect(`/importar/${id}${repeated ? "?repetido=1" : ""}`);
}

function colIndex(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export async function saveMappingAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const userId = await getCurrentUserId();
    const { config: current } = await getMappingStep(db, userId, id);
    const mode = str(fd, "amountMode");
    const config: ImportConfig = {
      headerRow: Number(str(fd, "headerRow") ?? current.headerRow),
      columns: {
        date: colIndex(fd, "date"),
        valueDate: colIndex(fd, "valueDate"),
        description: fd
          .getAll("description")
          .map((v) => Number(v))
          .filter((n) => Number.isInteger(n) && n >= 0),
        amount: mode === "split" ? null : colIndex(fd, "amount"),
        debit: mode === "split" ? colIndex(fd, "debit") : null,
        credit: mode === "split" ? colIndex(fd, "credit") : null,
        balance: colIndex(fd, "balance"),
        category: colIndex(fd, "category"),
      },
      dateFormat: (str(fd, "dateFormat") ?? current.dateFormat) as DateFormat,
      decimalSeparator: str(fd, "decimalSeparator") === "." ? "." : ",",
      invertSign: bool(fd, "invertSign"),
      confirmed: false,
    };
    const redetect = str(fd, "op") === "redetect" || config.headerRow !== current.headerRow;
    await saveImportConfig(db, userId, id, config, { redetect });
  });
  if (!r?.ok) return r;
  revalidatePath(`/importar/${id}`);
  return { ok: true };
}

export async function editMappingAction(id: string, _: ActionResult): Promise<ActionResult> {
  const r = await runAction(async () => reopenMapping(db, await getCurrentUserId(), id));
  if (!r?.ok) return r;
  revalidatePath(`/importar/${id}`);
  return { ok: true };
}

export async function commitImportAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const include = new Set(fd.getAll("include").map((v) => Number(v)));
    const selectable = fd.getAll("selectable").map((v) => Number(v));
    await commitImport(
      db,
      await getCurrentUserId(),
      id,
      {
        excludeRows: selectable.filter((i) => !include.has(i)),
        adjustOpening: bool(fd, "adjustOpening"),
        saveProfileName: bool(fd, "saveProfile") ? (str(fd, "profileName") ?? "Formato sin nombre") : undefined,
      },
      today(),
    );
  });
  if (!r?.ok) return r;
  revalidatePath("/", "layout");
  redirect(`/importar/${id}`);
}

export async function revertImportAction(id: string, _: ActionResult): Promise<ActionResult> {
  return runAction(async () => {
    const { deleted } = await revertImport(db, await getCurrentUserId(), id);
    revalidatePath("/", "layout");
    return { ok: true, message: `Importación deshecha: ${deleted} movimientos eliminados.` };
  });
}

export async function discardImportAction(id: string, _: ActionResult): Promise<ActionResult> {
  const r = await runAction(async () => discardPreview(db, await getCurrentUserId(), id));
  if (!r?.ok) return r;
  revalidatePath("/importar");
  redirect("/importar");
}
