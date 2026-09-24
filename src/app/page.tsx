import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PendingData } from "@/components/ui/PendingData";
import { buttonClass } from "@/components/ui/styles";
import { db } from "@/server/db";
import { getCurrentUserId } from "@/server/auth/current-user";
import { getOnboarding } from "@/server/services/onboarding";

const KPIS = ["Patrimonio neto", "Liquidez", "Inversiones", "Ahorro del mes"];

export default async function DashboardPage() {
  const userId = await getCurrentUserId();
  const [accounts, transactions, categories, rules, investments, onboarding] = await Promise.all([
    db.account.count({ where: { userId } }),
    db.transaction.count({ where: { userId } }),
    db.category.count({ where: { userId } }),
    db.categorizationRule.count({ where: { userId, active: true } }),
    db.investment.count({ where: { userId } }),
    getOnboarding(db, userId),
  ]);
  const pendingSteps = onboarding.steps.filter((s) => s.status === "pending");

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
        {!onboarding.finished ? (
          <Card className="border-info/30">
            <h2 className="text-base font-semibold">Primeros pasos</h2>
            <p className="mt-1 text-sm text-muted">
              {pendingSteps.length} paso(s) pendientes para tener una foto completa de tus finanzas.
            </p>
            <ol className="mt-3 space-y-1 text-sm">
              {onboarding.steps.map((s, i) => (
                <li key={s.key} className={s.status === "pending" ? "" : "text-muted line-through"}>
                  {i + 1}. {s.title}
                </li>
              ))}
            </ol>
            <Link href="/bienvenida" className={`${buttonClass()} mt-4`}>
              {onboarding.hasAccounts ? "Continuar asistente" : "Empezar"}
            </Link>
          </Card>
        ) : (
          <Card>
            <h2 className="text-base font-semibold">Accesos rápidos</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/movimientos/nuevo" className={buttonClass("secondary")}>Nuevo movimiento</Link>
              <Link href="/cuentas" className={buttonClass("secondary")}>Cuentas</Link>
              <Link href="/movimientos?categoria=none%7C" className={buttonClass("secondary")}>Sin categoría</Link>
            </div>
          </Card>
        )}

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
