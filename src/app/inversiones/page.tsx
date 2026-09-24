import type { Metadata } from "next";
import { ComingInPhase } from "@/components/ui/ComingInPhase";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Inversiones" };

export default function Page() {
  return (
    <>
      <PageHeader title="Inversiones" description="Aportaciones, valor actual y rentabilidad." />
      <ComingInPhase
        phase={6}
        items={[
          "Fondos indexados, ETF, acciones, PIAS, planes de pensiones, cripto",
          "Aportaciones y participaciones; precio medio",
          "Histórico de valores liquidativos",
          "Rentabilidad simple y ponderada por aportaciones (TIR)",
        ]}
      />
    </>
  );
}
