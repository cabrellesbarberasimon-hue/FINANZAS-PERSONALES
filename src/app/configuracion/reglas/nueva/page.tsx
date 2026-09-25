import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { CategorySelect } from "@/components/ui/CategorySelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { merchantKey } from "@/domain/text";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { listCategoryTree } from "@/server/services/categories";
import { saveRuleAction } from "../../actions";
import { RuleForm } from "../RuleForm";

export const metadata: Metadata = { title: "Nueva regla" };

export default async function NewRulePage({ searchParams }: { searchParams: Promise<{ desde?: string }> }) {
  const { desde } = await searchParams;
  const userId = await getCurrentUserId();
  const [categories, accounts, source] = await Promise.all([
    listCategoryTree(db, userId),
    db.account.findMany({ where: { userId, archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    desde ? db.transaction.findFirst({ where: { id: desde, userId } }) : null,
  ]);
  // Desde un movimiento: se propone su clave de comercio y su categoría actual.
  const key = source ? merchantKey(source.descriptionRaw) : "";
  return (
    <>
      <PageHeader
        title="Nueva regla"
        description={source ? `A partir de «${source.descriptionRaw}».` : "Si la descripción contiene… entonces categoría…"}
      />
      <Card>
        <RuleForm
          isNew
          action={saveRuleAction.bind(null, null)}
          accounts={accounts}
          defaults={source ? { field: "MERCHANT", matchType: "EQUALS", pattern: key || source.descriptionClean } : {}}
          categorySelect={
            <CategorySelect
              name="category"
              categories={categories}
              emptyLabel="Elige una categoría"
              defaultValue={source?.categoryId ? `${source.categoryId}|${source.subcategoryId ?? ""}` : undefined}
            />
          }
        />
      </Card>
    </>
  );
}
