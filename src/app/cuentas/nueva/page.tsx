import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { toISODate, today } from "@/domain/dates";
import { createAccountAction } from "../actions";
import { AccountForm } from "../AccountForm";

export const metadata: Metadata = { title: "Nueva cuenta" };

export default async function NewAccountPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <PageHeader title="Nueva cuenta" description="Registra dónde tienes tu dinero y con qué saldo empiezas." />
      <Card>
        <AccountForm
          action={createAccountAction}
          defaults={{ openingDate: toISODate(today()) }}
          submitLabel="Crear cuenta"
          next={next}
        />
      </Card>
    </>
  );
}
