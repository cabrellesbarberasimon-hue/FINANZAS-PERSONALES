import type { TxKind } from "@/domain/cashflow";
import { TX_KIND_LABELS } from "@/domain/transactions";
import { Badge, type BadgeTone } from "./Badge";

const TONE: Record<TxKind, BadgeTone> = {
  INCOME: "positive",
  EXPENSE: "neutral",
  TRANSFER: "info",
  INVESTMENT: "info",
  ADJUSTMENT: "warning",
};

export function KindBadge({ kind }: { kind: TxKind }) {
  return <Badge tone={TONE[kind]}>{TX_KIND_LABELS[kind]}</Badge>;
}
