import type { Metadata } from "next";
import { ComingInPhase } from "@/components/ui/ComingInPhase";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Cuentas" };

export default function Page() {
  return (
    <>
      <PageHeader title="Cuentas" description="Dónde está tu dinero." />
      <ComingInPhase
        phase={2}
        items={[
          "Alta de cuentas: nombre, entidad, tipo, moneda",
          "Saldo inicial y saldos declarados con fecha (histórico)",
          "Saldo calculado vs. saldo declarado",
          "Deudas y préstamos (pasivos)",
        ]}
      />
    </>
  );
}
