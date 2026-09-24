import type { ReactNode } from "react";
import clsx from "clsx";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, align = "left", className }: { children?: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <th
      className={clsx(
        "border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted sm:px-3",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = "left", className }: { children?: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td className={clsx("border-b border-border px-4 py-2.5 align-top sm:px-3", align === "right" && "text-right", className)}>
      {children}
    </td>
  );
}
