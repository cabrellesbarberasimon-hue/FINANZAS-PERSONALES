import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { IMPORT_STATUS } from "@/components/ui/importStatus";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th } from "@/components/ui/Table";
import { formatDateES } from "@/domain/dates";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { listImports } from "@/server/services/imports";
import { UploadForm } from "./UploadForm";

export const metadata: Metadata = { title: "Importar extracto" };

export default async function ImportPage() {
  const userId = await getCurrentUserId();
  const [accounts, imports] = await Promise.all([
    db.account.findMany({
      where: { userId, archived: false, type: { notIn: ["OTHER", "INVESTMENT"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    listImports(db, userId),
  ]);

  return (
    <>
      <PageHeader title="Importar extracto" description="Sube el extracto que descargas de tu banco. Nada se guarda hasta que revises y confirmes." />

      <Card>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted">
            Primero <Link href="/cuentas/nueva" className="text-info hover:underline">crea la cuenta</Link> a la que pertenece el extracto.
          </p>
        ) : (
          <UploadForm accounts={accounts} />
        )}
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted">
          <li>Formatos: CSV (cualquier separador y codificación) y Excel XLSX.</li>
          <li>
            ¿Tu banco da un <strong>.xls</strong> antiguo? Ábrelo con Excel o LibreOffice y guárdalo como «Libro de Excel (.xlsx)».
          </li>
          <li>Importar dos veces el mismo extracto, o extractos que se solapan, no duplica movimientos.</li>
        </ul>
      </Card>

      {imports.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-3 text-base font-semibold">Historial de importaciones</h2>
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Fichero</Th>
                <Th className="hidden md:table-cell">Cuenta</Th>
                <Th className="hidden sm:table-cell">Periodo</Th>
                <Th align="right">Nuevas</Th>
                <Th align="right" className="hidden sm:table-cell">Ya existían</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {imports.map((i) => (
                <tr key={i.id} className="hover:bg-canvas/60">
                  <Td className="whitespace-nowrap text-muted">{formatDateES(i.createdAt)}</Td>
                  <Td>
                    <Link href={`/importar/${i.id}`} className="font-medium hover:underline">
                      {i.fileName}
                    </Link>
                  </Td>
                  <Td className="hidden text-muted md:table-cell">{i.account.name}</Td>
                  <Td className="hidden whitespace-nowrap text-muted sm:table-cell">
                    {i.periodStart && i.periodEnd ? `${formatDateES(i.periodStart)} – ${formatDateES(i.periodEnd)}` : "—"}
                  </Td>
                  <Td align="right">{i.status === "PREVIEW" ? "—" : i.rowsNew}</Td>
                  <Td align="right" className="hidden sm:table-cell">{i.status === "PREVIEW" ? "—" : i.rowsDuplicate}</Td>
                  <Td>
                    <Badge tone={IMPORT_STATUS[i.status]?.tone}>{IMPORT_STATUS[i.status]?.label ?? i.status}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
