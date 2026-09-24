import type { Metadata } from "next";
import { ComingInPhase } from "@/components/ui/ComingInPhase";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Configuración" };

export default function Page() {
  return (
    <>
      <PageHeader title="Configuración" description="Categorías, reglas, copias de seguridad." />
      <ComingInPhase
        phase={4}
        items={[
          "Categorías y subcategorías",
          "Reglas automáticas y sugerencias aprendidas",
          "Copia de seguridad y restauración (fase 10)",
          "Eliminar datos demo",
        ]}
      />
    </>
  );
}
