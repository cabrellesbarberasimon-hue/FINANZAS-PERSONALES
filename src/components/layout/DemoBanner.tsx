import { getAppMode } from "@/server/config";

/** Aviso permanente cuando la app corre sobre la base de datos de demostración. */
export function DemoBanner() {
  if (getAppMode() !== "demo") return null;
  return (
    <div className="bg-warning px-4 py-1.5 text-center text-xs font-medium text-white">
      MODO DEMO — datos ficticios en data/demo.db. Tus datos reales no se usan ni se modifican.
    </div>
  );
}
