import "server-only";
import { cache } from "react";
import { db } from "@/server/db";

/**
 * Punto ÚNICO para obtener el usuario actual.
 *
 * Hoy la aplicación es local y monousuario: se usa el primer (y único)
 * usuario creado por el seed. Para añadir autenticación en el futuro basta con
 * cambiar esta función para leer la sesión (p.ej. Auth.js); todas las
 * consultas ya filtran por `userId`.
 */
export const getCurrentUser = cache(async () => {
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    throw new Error("No hay usuario. Ejecuta `npm run setup` para inicializar la base de datos.");
  }
  return user;
});

export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}
