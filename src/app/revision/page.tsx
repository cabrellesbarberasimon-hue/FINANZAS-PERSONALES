import type { Metadata } from "next";
import { ComingInPhase } from "@/components/ui/ComingInPhase";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Revisar datos" };

export default function Page() {
  return (
    <>
      <PageHeader title="Revisar datos" description="Mantén tus datos limpios." />
      <ComingInPhase
        phase={10}
        items={[
          "Movimientos sin categoría",
          "Posibles duplicados y operaciones dudosas",
          "Diferencias de saldo",
          "Inversiones sin valoración reciente",
        ]}
      />
    </>
  );
}
