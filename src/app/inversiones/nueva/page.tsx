import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { createInvestmentAction } from "../actions";
import { InvestmentForm } from "../InvestmentForm";

export const metadata: Metadata = { title: "Nueva inversión" };

export default async function NewInvestmentPage() {
  const userId = await getCurrentUserId();
  const accounts = await db.account.findMany({ where: { userId, archived: false, type: "BROKER" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader
        title="Nueva inversión"
        description="Después registrarás sus aportaciones y su valor liquidativo. Si ya la tenías, añade las aportaciones pasadas con su fecha."
      />
      <Card>
        <InvestmentForm action={createInvestmentAction} accounts={accounts} submitLabel="Crear inversión" />
      </Card>
    </>
  );
}
