# Finanzas Personales

Aplicación web local para controlar tus finanzas personales: cuentas, movimientos,
importación de extractos bancarios, inversiones (especialmente fondos indexados),
patrimonio, presupuestos y objetivos.

**Principios**: datos correctos → sin duplicados → trazabilidad → facilidad para
corregir → automatización → simplicidad. Nunca se inventan datos: si falta
información se muestra **"Pendiente de datos"**.

> Estado: **Fases 1, 2 y 3 completadas**: arquitectura, base de datos, cuentas
> (saldos, conciliación, deudas), movimientos (filtros, alta manual, edición
> con historial, transferencias internas), asistente inicial e importación de
> extractos CSV/XLSX con anti-duplicados y conciliación. El diseño completo y el plan por fases están en
> [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

---

## Requisitos

- Node.js ≥ 22
- npm ≥ 10
- Nada más: sin servicios externos, sin cuentas, sin Docker. La base de datos es un
  fichero SQLite local.

## Instalación

```bash
git clone <repo> finanzas-personales
cd finanzas-personales
npm install
cp .env.example .env
npm run setup        # crea data/finanzas.db, aplica migraciones y carga categorías/reglas
```

## Ejecución

```bash
npm run dev          # desarrollo: http://localhost:3000
# o bien
npm run build && npm start
```

### Modo demo (datos ficticios, separados de los tuyos)

```bash
npm run demo:setup   # crea data/demo.db con datos ficticios (6 cuentas, ~220 movimientos, marzo-sept 2026)
npm run demo:dev     # arranca la app sobre data/demo.db (banner naranja "MODO DEMO")
npm run demo:delete  # elimina completamente los datos demo
```

Los datos demo viven en **otro fichero** (`data/demo.db`); tus datos reales
(`data/finanzas.db`) nunca se leen ni se modifican en modo demo.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `start` | Compilación y servidor de producción local |
| `npm test` | Tests (dominio + integración con BD temporal) |
| `npm run typecheck` | Comprobación de tipos |
| `npm run lint` | ESLint |
| `npm run setup` | Migraciones + cliente Prisma + seed (idempotente) |
| `npm run db:migrate` | Crear una nueva migración tras cambiar `schema.prisma` |
| `npm run db:studio` | Explorar la BD en el navegador (Prisma Studio) |
| `npm run demo:*` | Gestión de datos demo (ver arriba) |

---

## Estructura

```
docs/ARQUITECTURA.md   diseño completo: modelo de datos, flujos, cálculos, riesgos
prisma/                esquema, migraciones y seed (categorías y reglas iniciales)
scripts/               utilidades (datos demo)
src/app/               páginas (Next.js App Router)
src/components/        componentes de interfaz
src/domain/            lógica financiera PURA y testeada (dinero, fechas, duplicados, ahorro…)
src/server/            acceso a base de datos, configuración, usuario actual
tests/                 tests de dominio y de base de datos
data/                  tu base de datos y backups (NO se sube a git)
```

Regla de oro: **los cálculos financieros solo viven en `src/domain`**, sin acceso
a BD ni red, para que sean reproducibles y testeables. Las páginas solo orquestan.

## Base de datos

- Motor: SQLite (`data/finanzas.db`) mediante Prisma 7 + `better-sqlite3`.
- Esquema comentado: [`prisma/schema.prisma`](prisma/schema.prisma).
- **Importes en céntimos enteros** (`1.234,56 €` → `123456`). Participaciones y
  precios en `Decimal`. Fechas contables a 00:00 UTC.
- **Históricos nunca se sobrescriben**: saldos, valores liquidativos y deudas se
  guardan como filas nuevas por fecha.
- Cambiar el esquema: editar `prisma/schema.prisma` → `npm run db:migrate -- --name descripcion`.
- **Migrar a PostgreSQL** (futuro): cambiar `provider = "postgresql"` en el esquema,
  sustituir el adaptador en `src/server/prisma.ts` por `@prisma/adapter-pg`,
  regenerar migraciones y trasladar los datos con el backup JSON.

## Uso (fase 2)

- **Cuentas**: crea cada cuenta con su saldo y la fecha de ese saldo (saldo al final
  de ese día). El saldo actual se calcula como saldo inicial + movimientos
  posteriores. Registra de vez en cuando el saldo que indica tu banco: la
  aplicación lo compara con el suyo y, si no cuadra, te indica en qué periodo
  aparece la diferencia.
- **Otros activos** (vivienda, coche) y cuentas de inversión sin detalle: tipo
  «Otros activos» / «Inversión», valorados con saldos manuales.
- **Deudas**: en Cuentas → «+ Deuda», con histórico de deuda pendiente.
- **Movimientos**: los filtros viven en la URL (`/movimientos?mes=2026-09&tipo=EXPENSE`),
  así que cualquier cifra puede enlazar a las operaciones que la forman.
  Cada edición queda en el historial del movimiento.
- **Transferencias internas**: abre uno de los dos movimientos; la app propone
  contrapartidas en otras cuentas (importe opuesto, ±5 días). Vinculadas, no
  cuentan como ingreso, gasto ni ahorro.

## Backup

*(Implementación completa en la fase 10.)*

Mientras tanto, la copia de seguridad manual es copiar el fichero con la app parada:

```bash
cp data/finanzas.db backups/finanzas-$(date +%F).db
```

La fase 10 añade en Configuración: **Exportar copia de seguridad** (fichero SQLite
consistente + JSON versionado) e **Importar copia de seguridad** (valida antes de
restaurar y guarda automáticamente el estado actual).

## Importación de extractos

Diseño completo en [`docs/ARQUITECTURA.md` §5](docs/ARQUITECTURA.md#5-flujo-de-importación-de-extractos).

1. **Importar** → elige la cuenta y sube el fichero (CSV o XLSX, máx. 5 MB).
   Los `.xls` antiguos no se admiten: ábrelos con Excel/LibreOffice y guárdalos
   como `.xlsx`.
2. **Columnas**: la app detecta la fila de cabecera (aunque haya títulos antes),
   la codificación, el separador, el formato de fecha y el decimal, y propone qué
   es cada columna. Revísalo con la muestra.
3. **Revisión**: «Se han detectado N operaciones · X nuevas · Y ya existían ·
   Z posibles duplicados · W no válidas», con la categoría propuesta por las
   reglas, la comprobación del saldo del propio extracto y la conciliación
   prevista. Desmarca lo que no quieras.
4. **Confirmar**: se guarda todo de una vez. El saldo final del extracto queda
   registrado y, si no cuadra, aparece un aviso en Revisión.
5. **Deshacer**: desde el detalle de la importación.

Reimportar el mismo extracto, o uno que se solapa, nunca duplica movimientos.
Los posibles duplicados (mismo importe, fecha cercana, texto parecido) se
importan marcados para revisión, nunca en silencio.

### Añadir un nuevo formato bancario

1. Lo normal es **no programar nada**: al importar, asigna las columnas una vez y
   marca «Recordar este formato»; se reconocerá automáticamente por sus
   cabeceras (`ImportProfile.headerSignature`).
2. Si la detección automática de columnas falla con tu banco, añade sus nombres
   de columna a los patrones de `suggestConfig` en `src/server/import/detect.ts`.
3. Si el formato necesita lógica especial (PDF, Norma 43…), implementa la
   interfaz `StatementParser` (`src/server/import/types.ts`) en
   `src/server/import/parsers/` y añádela a `PARSERS` en `parsers/index.ts`.
3. Añade un extracto de ejemplo **anonimizado** en `tests/fixtures/` y un test.

## Categorías

- Las categorías iniciales están en [`prisma/seed-data/categories.ts`](prisma/seed-data/categories.ts)
  y las reglas iniciales ("MERCADONA → Alimentación / Supermercado"…) en
  [`prisma/seed-data/rules.ts`](prisma/seed-data/rules.ts).
- **Para tu instalación**: crea categorías, subcategorías y reglas desde
  Configuración (fase 4). El seed es idempotente y nunca borra ni renombra lo tuyo.
- **Para instalaciones nuevas**: añade entradas a esos ficheros y ejecuta
  `npm run db:seed`. Las categorías que falten se crean; las existentes no se tocan.

## Tests

```bash
npm test
```

- `tests/domain/`: parser de importes y fechas, normalización de textos, hash
  anti-duplicados (reimportar, extractos solapados, operaciones idénticas
  legítimas, duplicados probables), cálculo de ahorro y exclusión de transferencias.
- `tests/import/`: lectura de extractos (Windows-1252 con títulos, UTF-8 con
  cargo/abono, XLSX, tarjeta con signos invertidos, XLS antiguo, HTML
  disfrazado), filas no válidas, coherencia de saldo.
- `tests/db/imports.test.ts`: flujo completo — reimportar sin duplicar,
  extractos solapados, duplicados probables, exclusión de filas, deshacer,
  ajuste de saldo inicial, perfiles por banco.
- `tests/db/`: restricciones de integridad, cuentas (saldo calculado, conciliación,
  auditoría), movimientos (alta, edición, duplicados, filtros) y transferencias
  internas, sobre una BD SQLite temporal (nunca toca `data/`).

## Privacidad y seguridad

- Todo se guarda en local. No se envía información a servicios externos.
- No se almacenan credenciales bancarias ni se conecta con el banco.
- `data/`, `*.db`, `backups/` y `.env` están excluidos de git.
- La app no tiene autenticación todavía: úsala solo en tu equipo. El modelo ya
  está preparado para añadirla antes de desplegar en un servidor.
