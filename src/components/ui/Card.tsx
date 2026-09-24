import type { ReactNode } from "react";
import clsx from "clsx";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-xl border border-border bg-surface p-4 sm:p-5", className)}>
      {children}
    </section>
  );
}
