import path from "node:path";

/**
 * Configuración de entorno centralizada. Toda lectura de variables de entorno
 * pasa por aquí para que el modo demo nunca pueda apuntar a la base real.
 */

export type AppMode = "real" | "demo";

export const DEFAULT_REAL_DB = "file:./data/finanzas.db";
export const DEFAULT_DEMO_DB = "file:./data/demo.db";

export function getAppMode(): AppMode {
  return process.env.APP_MODE === "demo" ? "demo" : "real";
}

export function getDatabaseUrl(): string {
  const mode = getAppMode();
  const url = process.env.DATABASE_URL ?? (mode === "demo" ? DEFAULT_DEMO_DB : DEFAULT_REAL_DB);
  // Salvaguarda: en modo demo solo se permite una base de datos con "demo" en el nombre.
  if (mode === "demo" && !/demo[^/\\]*\.db$/i.test(url)) {
    throw new Error(
      `APP_MODE=demo exige una base de datos demo (p.ej. ${DEFAULT_DEMO_DB}); recibido: ${url}`,
    );
  }
  return url;
}

/** "file:./data/finanzas.db" -> ruta absoluta del fichero SQLite. */
export function sqliteFilePath(url: string = getDatabaseUrl()): string {
  if (!url.startsWith("file:")) {
    throw new Error(`Solo se admite SQLite (file:...) en esta versión; recibido: ${url}`);
  }
  const p = url.slice("file:".length);
  return path.isAbsolute(p) ? p : path.resolve(/*turbopackIgnore: true*/ process.cwd(), p);
}
