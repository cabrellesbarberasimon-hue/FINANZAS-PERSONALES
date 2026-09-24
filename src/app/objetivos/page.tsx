import type { Metadata } from "next";
import { ComingInPhase } from "@/components/ui/ComingInPhase";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Objetivos" };

export default function Page() {
  return (
    <>
      <PageHeader title="Objetivos" description="Metas financieras y su progreso." />
      <ComingInPhase
        phase={8}
        items={[
          "Fondo de emergencia, inversión, viaje, vivienda, vehículo",
          "Progreso vinculado a cuentas o inversiones",
        ]}
      />
    </>
  );
}
