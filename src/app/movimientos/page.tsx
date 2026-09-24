import type { Metadata } from "next";
import { ComingInPhase } from "@/components/ui/ComingInPhase";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Movimientos" };

export default function Page() {
  return (
    <>
      <PageHeader title="Movimientos" description="Todas tus operaciones, con filtros y edición." />
      <ComingInPhase
        phase={2}
        items={[
          "Tabla con fecha, descripción, categoría, cuenta, importe y tipo",
          "Filtros por fecha, mes, año, cuenta, categoría, importe y texto",
          "Edición de cualquier movimiento con registro de auditoría",
          "Vinculación de transferencias internas",
        ]}
      />
    </>
  );
}
