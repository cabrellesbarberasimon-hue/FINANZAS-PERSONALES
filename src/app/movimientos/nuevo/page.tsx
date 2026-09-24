import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CategorySelect } from "@/components/ui/CategorySelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { toISODate, today } from "@/domain/dates";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { listCategoryTree } from "@/server/services/categories";
import { NewTransactionForm } from "./NewTransactionForm";

export const metadata: Metadata = { title: "Nuevo movimiento" };

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string; creado?: string }>;
}) {
  const { cuenta, creado } = await searchParams;
  const userId = await getCurrentUserId();
  const [accounts, categories] = await Promise.all([
    db.account.findMany({ where: { userId, archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    listCategoryTree(db, userId),
  ]);

  return (
    <>
      <PageHeader title="Nuevo movimiento" description="Para efectivo u operaciones que no vienen en un extracto." />
      {creado && (
        <p className="mb-4 rounded-lg border border-positive/20 bg-positive/10 px-3 py-2 text-sm text-positive">Movimiento guardado.</p>
      )}
      <Card>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted">
            Primero <Link className="text-info hover:underline" href="/cuentas/nueva">crea una cuenta</Link>.
          </p>
        ) : (
          <NewTransactionForm
            accounts={accounts}
            categorySelect={<CategorySelect name="category" categories={categories} />}
            today={toISODate(today())}
            defaultAccountId={cuenta}
          />
        )}
      </Card>
    </>
  );
}
