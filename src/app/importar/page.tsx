import type { Metadata } from "next";
import { ComingInPhase } from "@/components/ui/ComingInPhase";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Importar extracto" };

export default function Page() {
  return (
    <>
      <PageHeader title="Importar extracto" description="Sube un CSV, XLSX o XLS de tu banco." />
      <ComingInPhase
        phase={3}
        items={[
          "Detección de encabezados y vista previa",
          "Asignación de columnas y perfiles por banco",
          "Detección de duplicados antes de guardar",
          "Conciliación con el saldo del extracto",
        ]}
      />
    </>
  );
}
