import type { Metadata } from "next";
import { ComingInPhase } from "@/components/ui/ComingInPhase";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Presupuestos" };

export default function Page() {
  return (
    <>
      <PageHeader title="Presupuestos" description="Límites mensuales por categoría." />
      <ComingInPhase
        phase={8}
        items={[
          "Presupuesto por categoría o subcategoría",
          "Gastado / presupuesto y porcentaje",
        ]}
      />
    </>
  );
}
