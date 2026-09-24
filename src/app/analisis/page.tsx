import type { Metadata } from "next";
import { ComingInPhase } from "@/components/ui/ComingInPhase";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Análisis" };

export default function Page() {
  return (
    <>
      <PageHeader title="Análisis" description="Qué ha pasado este mes y cómo se compara." />
      <ComingInPhase
        phase={9}
        items={[
          "Resumen mensual: ingresos, gastos, ahorro, tasa de ahorro",
          "Comparaciones mes anterior / mismo mes año anterior / año",
          "Gastos recurrentes y suscripciones",
          "Alertas inteligentes",
        ]}
      />
    </>
  );
}
