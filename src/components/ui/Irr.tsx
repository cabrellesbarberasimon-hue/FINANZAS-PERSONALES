import { daysBetween } from "@/domain/dates";
import { formatPercent } from "@/domain/money";
import { PendingData } from "./PendingData";

/**
 * TIR anual. Con menos de un año de historia la cifra anualizada exagera
 * (un +3 % en 2 meses "son" +19 % al año): se marca y se muestra atenuada.
 */
export function Irr({ irr, since, asOf, compact }: { irr: number | null; since: Date | null; asOf: Date; compact?: boolean }) {
  if (irr === null) return compact ? <span className="text-muted">—</span> : <PendingData reason="Necesita valoración actual." />;
  const short = since !== null && daysBetween(since, asOf) < 365;
  const text = formatPercent(irr * 100, { signed: true });
  if (!short) return <span className="whitespace-nowrap tabular-nums">{text}</span>;
  return (
    <span className="whitespace-nowrap tabular-nums text-muted" title="Anualizada con menos de un año de historia: tómala con cautela y fíjate en la rentabilidad simple.">
      {text}
      <sup className="ml-0.5 text-[0.65em] text-warning">&lt;1a</sup>
    </span>
  );
}
