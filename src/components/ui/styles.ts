import clsx from "clsx";

/**
 * Clases compartidas. Viven en un módulo sin "use client" para que puedan
 * usarse tanto en componentes de servidor como de cliente.
 */

export const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-info focus:outline-none focus:ring-2 focus:ring-info/20 disabled:bg-canvas disabled:text-muted";

const BUTTON_VARIANTS = {
  primary: "bg-info text-white hover:bg-info/90",
  secondary: "border border-border bg-surface text-ink hover:bg-canvas",
  danger: "border border-negative/30 bg-surface text-negative hover:bg-negative/5",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export function buttonClass(variant: ButtonVariant = "primary") {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-60",
    BUTTON_VARIANTS[variant],
  );
}
