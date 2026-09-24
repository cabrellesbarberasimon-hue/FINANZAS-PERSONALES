import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle, SkipForward } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { InlineActionButton } from "@/components/ui/InlineActionButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClass } from "@/components/ui/styles";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { getOnboarding } from "@/server/services/onboarding";
import { finishOnboardingAction, markStepAction } from "./actions";

export const metadata: Metadata = { title: "Primeros pasos" };

export default async function WelcomePage() {
  const { steps } = await getOnboarding(db, await getCurrentUserId());
  const current = steps.find((s) => s.status === "pending");

  return (
    <>
      <PageHeader
        title="Primeros pasos"
        description="Seis pasos para tener una foto fiable de tus finanzas. Puedes saltar cualquiera y volver más tarde."
      />
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => {
          const isCurrent = s === current;
          const Icon = s.status === "done" ? CheckCircle2 : s.status === "skipped" ? SkipForward : Circle;
          return (
            <li key={s.key}>
              <Card className={isCurrent ? "border-info/40 ring-2 ring-info/10" : undefined}>
                <div className="flex items-start gap-3">
                  <Icon
                    className={`mt-0.5 size-5 shrink-0 ${s.status === "done" ? "text-positive" : s.status === "skipped" ? "text-muted" : "text-info"}`}
                    aria-hidden
                  />
                  <div className="flex-1">
                    <p className="font-medium">
                      {i + 1}. {s.title}
                      {s.status === "skipped" && <span className="ml-2 text-xs font-normal text-muted">(saltado)</span>}
                    </p>
                    <p className="text-sm text-muted">{s.description}</p>
                    {s.availableInPhase && s.status === "pending" && (
                      <p className="mt-1 text-xs text-warning">Disponible a partir de la fase {s.availableInPhase}: de momento puedes saltarlo.</p>
                    )}
                    {s.key === "balances" && s.status === "pending" && (
                      <p className="mt-1 text-xs text-muted">
                        Comprueba en Cuentas que cada una tiene el saldo correcto y la fecha de ese saldo; si tu banco te da el saldo de hoy, regístralo para conciliar.
                      </p>
                    )}
                    {s.status !== "done" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!s.availableInPhase && (
                          <Link href={s.key === "accounts" ? `${s.href}?next=wizard` : s.href} className={buttonClass(isCurrent ? "primary" : "secondary")}>
                            Ir
                          </Link>
                        )}
                        {s.key === "balances" && (
                          <InlineActionButton action={markStepAction.bind(null, s.key)} hidden={{ op: "confirm" }}>
                            Hecho
                          </InlineActionButton>
                        )}
                        {s.status === "pending" && (
                          <InlineActionButton action={markStepAction.bind(null, s.key)} hidden={{ op: "skip" }}>
                            Saltar
                          </InlineActionButton>
                        )}
                        {s.status === "skipped" && (
                          <InlineActionButton action={markStepAction.bind(null, s.key)} hidden={{ op: "reset" }}>
                            Retomar
                          </InlineActionButton>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
        <li>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">6. Ver el dashboard</p>
              <InlineActionButton action={finishOnboardingAction} variant={current ? "secondary" : "primary"}>
                {current ? "Terminar más tarde e ir al dashboard" : "Ir al dashboard"}
              </InlineActionButton>
            </div>
          </Card>
        </li>
      </ol>
    </>
  );
}
