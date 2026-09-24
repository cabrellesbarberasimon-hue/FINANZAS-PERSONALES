import type { BadgeTone } from "./Badge";

export const IMPORT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PREVIEW: { label: "Pendiente", tone: "warning" },
  COMMITTED: { label: "Importado", tone: "positive" },
  REVERTED: { label: "Deshecho", tone: "neutral" },
  FAILED: { label: "Error", tone: "negative" },
};
