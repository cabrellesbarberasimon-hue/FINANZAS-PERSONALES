/**
 * Datos de demostración — SIEMPRE en una base de datos separada (data/demo.db).
 *
 *   npm run demo:setup   crea/actualiza data/demo.db con el esquema y datos ficticios
 *   npm run demo:dev     arranca la app sobre la base demo (banner naranja visible)
 *   npm run demo:delete  borra data/demo.db por completo
 *
 * Tus datos reales (data/finanzas.db) nunca se leen ni se modifican desde aquí.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { DEFAULT_DEMO_DB, sqliteFilePath } from "../src/server/config";
import { createPrismaClient } from "../src/server/prisma";
import { seedBase } from "../prisma/seed-lib";

const demoEnv = { ...process.env, APP_MODE: "demo", DATABASE_URL: DEFAULT_DEMO_DB };
const demoFile = sqliteFilePath(DEFAULT_DEMO_DB);

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: demoEnv, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function setup() {
  run("npx", ["prisma", "migrate", "deploy"]);
  const db = createPrismaClient(DEFAULT_DEMO_DB);
  try {
    await seedBase(db, "Usuario demo");
    // Los datos ficticios (cuentas, movimientos, inversiones) se añaden en
    // scripts/demo-data.ts a medida que cada fase implementa sus entidades.
    const { seedDemoData } = await import("./demo-data");
    await seedDemoData(db);
  } finally {
    await db.$disconnect();
  }
  console.log(`[demo] Base de datos demo lista: ${demoFile}`);
}

function remove() {
  let removed = 0;
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const f = demoFile + suffix;
    if (existsSync(f)) {
      rmSync(f);
      removed++;
    }
  }
  console.log(removed ? `[demo] Eliminada ${demoFile}` : "[demo] No había base de datos demo.");
}

const command = process.argv[2];
switch (command) {
  case "setup":
    await setup();
    break;
  case "dev":
    if (!existsSync(demoFile)) await setup();
    run("npx", ["next", "dev"]);
    break;
  case "delete":
    remove();
    break;
  default:
    console.error("Uso: tsx scripts/demo.ts <setup|dev|delete>");
    process.exit(1);
}
