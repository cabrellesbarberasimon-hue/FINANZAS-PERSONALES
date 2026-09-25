import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { InlineActionButton } from "@/components/ui/InlineActionButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th } from "@/components/ui/Table";
import { formatDateES } from "@/domain/dates";
import { getCurrentUserId } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { listImportProfiles } from "@/server/services/imports";
import { deleteProfileAction } from "../actions";

export const metadata: Metadata = { title: "Formatos de banco" };

export default async function ProfilesPage() {
  const profiles = await listImportProfiles(db, await getCurrentUserId());
  return (
    <>
      <PageHeader
        title="Formatos de banco"
        description="Cómo leer los extractos de cada banco. Se crean al importar marcando «Recordar este formato» y se reconocen por sus cabeceras."
      />
      <Card>
        {profiles.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay formatos guardados.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th className="hidden sm:table-cell">Cuenta</Th>
                <Th className="hidden md:table-cell">Cabeceras</Th>
                <Th align="right">Usos</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <span className="font-medium">{p.name}</span>
                    <div className="text-xs text-muted">Actualizado {formatDateES(p.updatedAt)}</div>
                  </Td>
                  <Td className="hidden text-muted sm:table-cell">{p.account?.name ?? "—"}</Td>
                  <Td className="hidden font-mono text-xs text-muted md:table-cell">{p.headerSignature.split("|").filter(Boolean).join(" · ")}</Td>
                  <Td align="right">{p._count.imports}</Td>
                  <Td align="right">
                    <InlineActionButton action={deleteProfileAction.bind(null, p.id)} variant="danger" confirm="¿Olvidar este formato? Las importaciones pasadas no se ven afectadas.">
                      Olvidar
                    </InlineActionButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
