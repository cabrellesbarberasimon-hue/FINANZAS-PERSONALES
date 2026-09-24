import type { Metadata } from "next";
import { ComingInPhase } from "@/components/ui/ComingInPhase";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Patrimonio" };

export default function Page() {
  return (
    <>
      <PageHeader title="Patrimonio" description="Evolución de tu patrimonio neto." />
      <ComingInPhase
        phase={7}
        items={[
          "Activos − pasivos = patrimonio neto",
          "Evolución mensual: liquidez, inversión, otros activos",
          "Puente mensual: ahorro vs. rentabilidad de inversiones",
        ]}
      />
    </>
  );
}
