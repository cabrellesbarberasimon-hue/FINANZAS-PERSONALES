import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { UserError } from "./services/common";

/**
 * Envuelve una Server Action: los UserError se devuelven como mensaje para el
 * formulario; redirect()/notFound() se relanzan; el resto se registra y se
 * muestra un error genérico (sin filtrar detalles internos).
 */
export async function runAction(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    console.error(e);
    return { ok: false, error: "Error inesperado. Revisa la consola del servidor." };
  }
}
