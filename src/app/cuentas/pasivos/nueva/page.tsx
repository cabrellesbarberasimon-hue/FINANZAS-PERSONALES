import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { toISODate, today } from "@/domain/dates";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { createLiabilityAction } from "../../actions";
import { LiabilityForm } from "../LiabilityForm";

export const metadata: Metadata = { title: "Nueva deuda" };

export default async function NewLiabilityPage() {
  const userId = await getCurrentUserId();
  const accounts = await db.account.findMany({ where: { userId, archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Nueva deuda" description="Préstamos, hipoteca, financiación u otras deudas." />
      <Card>
        <LiabilityForm action={createLiabilityAction} accounts={accounts} submitLabel="Crear deuda" withInitialBalance today={toISODate(today())} />
      </Card>
    </>
  );
}
