import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PendingData } from "@/components/ui/PendingData";
import { db } from "@/server/db";
import { getCurrentUserId } from "@/server/auth/current-user";

const KPIS = ["Patrimonio neto", "Liquidez", "Inversiones", "Ahorro del mes"];

const ONBOARDING = [
  { label: "Crear cuentas", href: "/cuentas" },
  { label: "Introducir saldos iniciales", href: "/cuentas" },
  { label: "Registrar inversiones existentes", href: "/inversiones" },
  { label: "Importar primer extracto", href: "/importar" },
  { label: "Revisar categorías", href: "/configuracion" },
];

export default async function DashboardPage() {
  const userId = await getCurrentUserId();
  const [accounts, transactions, categories, rules, investments] = await Promise.all([
    db.account.count({ where: { userId } }),
    db.transaction.count({ where: { userId } }),
    db.category.count({ where: { userId } }),
    db.categorizationRule.count({ where: { userId, active: true } }),
    db.investment.count({ where: { userId } }),
  ]);

  return (
    <>
      <PageHeader title="Dashboard" description="Tu situación financiera de un vistazo." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((k) => (
          <Card key={k}>
            <p className="text-sm text-muted">{k}</p>
            <div className="mt-2">
              <PendingData reason="Aún no hay cuentas ni movimientos registrados." />
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-semibold">Primeros pasos</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {ONBOARDING.map((s, i) => (
              <li key={s.label} className="flex items-center gap-3">
                <span className="flex size-6 items-center justify-center rounded-full bg-info/10 text-xs font-semibold text-info">
                  {i + 1}
                </span>
                <Link href={s.href} className="hover:underline">
                  {s.label}
                </Link>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted">
            El asistente guiado de primera ejecución se activa en la fase 2.
          </p>
        </Card>

        <Card>
          <h2 className="text-base font-semibold">Estado de la base de datos</h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Cuentas</dt>
            <dd className="text-right font-medium">{accounts}</dd>
            <dt className="text-muted">Movimientos</dt>
            <dd className="text-right font-medium">{transactions}</dd>
            <dt className="text-muted">Inversiones</dt>
            <dd className="text-right font-medium">{investments}</dd>
            <dt className="text-muted">Categorías</dt>
            <dd className="text-right font-medium">{categories}</dd>
            <dt className="text-muted">Reglas activas</dt>
            <dd className="text-right font-medium">{rules}</dd>
          </dl>
        </Card>
      </div>
    </>
  );
}
