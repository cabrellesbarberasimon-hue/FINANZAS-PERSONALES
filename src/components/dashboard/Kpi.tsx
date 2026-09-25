import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

/** Tarjeta KPI: cifra principal + contexto + desglose "¿De dónde sale?". */
export function Kpi({
  title,
  value,
  children,
  breakdown,
}: {
  title: string;
  value: ReactNode;
  children?: ReactNode;
  breakdown?: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-2">
      <p className="text-sm text-muted">{title}</p>
      <div className="text-2xl font-semibold tracking-tight tabular-nums sm:text-[1.7rem]">{value}</div>
      {children && <div className="flex flex-col gap-1">{children}</div>}
      {breakdown && (
        <details className="group mt-1 text-sm">
          <summary className="cursor-pointer select-none text-xs font-medium text-info hover:underline">¿De dónde sale?</summary>
          <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">{breakdown}</div>
        </details>
      )}
    </Card>
  );
}

/** Fila de desglose: etiqueta (enlazable) + importe alineado a la derecha. */
export function BreakdownRow({ label, value, href, muted }: { label: ReactNode; value: ReactNode; href?: string; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${muted ? "text-muted" : ""}`}>
      {href ? (
        <Link href={href} className="min-w-0 truncate hover:underline">
          {label}
        </Link>
      ) : (
        <span className="min-w-0 truncate">{label}</span>
      )}
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}
