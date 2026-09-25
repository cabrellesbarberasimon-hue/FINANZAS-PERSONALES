import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, DatabaseBackup, FileSpreadsheet, FolderTree, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUserId } from "@/server/auth/current-user";
import { getAppMode } from "@/server/config";
import { db } from "@/server/db";
import { getRuleSuggestions } from "@/server/services/rules";

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage() {
  const userId = await getCurrentUserId();
  const [categories, rules, profiles, suggestions] = await Promise.all([
    db.category.count({ where: { userId, archived: false } }),
    db.categorizationRule.count({ where: { userId, active: true } }),
    db.importProfile.count({ where: { userId } }),
    getRuleSuggestions(db, userId),
  ]);
  const items = [
    { href: "/configuracion/categorias", icon: FolderTree, title: "Categorías", text: `${categories} categorías activas con sus subcategorías.` },
    {
      href: "/configuracion/reglas",
      icon: Wand2,
      title: "Reglas automáticas",
      text: `${rules} reglas activas.${suggestions.length ? ` ${suggestions.length} sugerencia(s) aprendidas pendientes.` : ""}`,
    },
    { href: "/configuracion/formatos", icon: FileSpreadsheet, title: "Formatos de banco", text: `${profiles} formato(s) de extracto recordados.` },
  ];
  return (
    <>
      <PageHeader title="Configuración" />
      <div className="flex flex-col gap-3">
        {items.map(({ href, icon: Icon, title, text }) => (
          <Link key={href} href={href}>
            <Card className="flex items-center gap-4 transition-colors hover:border-info/40">
              <Icon className="size-5 text-info" aria-hidden />
              <div className="flex-1">
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted">{text}</p>
              </div>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </Card>
          </Link>
        ))}
        <Card className="flex items-center gap-4">
          <DatabaseBackup className="size-5 text-muted" aria-hidden />
          <div className="flex-1">
            <p className="font-medium">Copia de seguridad y exportación</p>
            <p className="text-sm text-muted">Disponible en la fase 10. Mientras tanto, copia el fichero data/finanzas.db con la app parada.</p>
          </div>
        </Card>
        {getAppMode() === "demo" && (
          <Card className="border-warning/40">
            <p className="font-medium text-warning">Modo demo</p>
            <p className="text-sm text-muted">
              Estás usando data/demo.db con datos ficticios. Para borrarlos por completo: <code>npm run demo:delete</code>. Tus datos reales no se ven afectados.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
