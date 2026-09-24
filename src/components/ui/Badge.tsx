import type { ReactNode } from "react";
import clsx from "clsx";

const TONES = {
  neutral: "bg-canvas text-muted border-border",
  info: "bg-info/10 text-info border-info/20",
  positive: "bg-positive/10 text-positive border-positive/20",
  negative: "bg-negative/10 text-negative border-negative/20",
  warning: "bg-warning/10 text-warning border-warning/20",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span className={clsx("inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium", TONES[tone])}>
      {children}
    </span>
  );
}
