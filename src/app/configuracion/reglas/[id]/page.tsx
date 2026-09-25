import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { CategorySelect } from "@/components/ui/CategorySelect";
import { InlineActionButton } from "@/components/ui/InlineActionButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { centsToInput } from "@/domain/money";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { listCategoryTree } from "@/server/services/categories";
import { deleteRuleAction, saveRuleAction } from "../../actions";
import { RuleForm } from "../RuleForm";

export const metadata: Metadata = { title: "Regla" };

export default async function RulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  const rule = await db.categorizationRule.findFirst({ where: { id, userId } });
  if (!rule) notFound();
  const [categories, accounts, used] = await Promise.all([
    listCategoryTree(db, userId),
    db.account.findMany({ where: { userId, archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.transaction.count({ where: { userId, ruleId: id } }),
  ]);
  return (
    <>
      <PageHeader
        title={`Regla «${rule.pattern}»`}
        description={`${rule.origin === "SYSTEM" ? "Regla del sistema" : rule.origin === "LEARNED" ? "Aprendida de tus correcciones" : "Creada por ti"} · categoriza ${used} movimiento(s) ahora mismo`}
      />
      <Card>
        <RuleForm
          isNew={false}
          action={saveRuleAction.bind(null, id)}
          accounts={accounts}
          defaults={{
            name: rule.name,
            field: rule.field,
            matchType: rule.matchType,
            pattern: rule.pattern,
            accountId: rule.accountId,
            amountMin: rule.amountMin === null ? undefined : centsToInput(rule.amountMin),
            amountMax: rule.amountMax === null ? undefined : centsToInput(rule.amountMax),
            priority: rule.priority,
            active: rule.active,
          }}
          categorySelect={
            <CategorySelect name="category" categories={categories} emptyLabel="Elige una categoría" defaultValue={`${rule.categoryId}|${rule.subcategoryId ?? ""}`} />
          }
        />
      </Card>
      <Card className="mt-6">
        <p className="mb-3 text-sm text-muted">
          Borrar la regla no cambia la categoría de los movimientos ya categorizados (hasta que pulses «Recalcular todos los automáticos»).
          {rule.origin === "SYSTEM" && " Si solo quieres que deje de aplicarse, desactívala."}
        </p>
        <InlineActionButton action={deleteRuleAction.bind(null, id)} variant="danger" confirm="¿Borrar esta regla?">
          Borrar regla
        </InlineActionButton>
      </Card>
    </>
  );
}
