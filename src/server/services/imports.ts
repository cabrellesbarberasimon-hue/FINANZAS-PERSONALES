import { createHash } from "node:crypto";
import { z } from "zod";
import { DATE_FORMATS, formatDateES, type DateFormat } from "@/domain/dates";
import { assignDedupHashes, classifyRows, PROBABLE_DUPLICATE_MAX_DAYS, type DedupStatus } from "@/domain/dedup";
import { findMatchingRule } from "@/domain/rules";
import { cleanDescription, merchantKey } from "@/domain/text";
import { defaultKindForAmount } from "@/domain/transactions";
import { balanceMethod } from "@/domain/accounts";
import type { TxKind } from "@/domain/cashflow";
import type { Import } from "@/generated/prisma/client";
import { detectHeaderRow, headerLabels, headerSignature, isDateFormatAmbiguous, suggestConfig } from "@/server/import/detect";
import { normalizeTable, openingFromStatement, type NormalizeResult } from "@/server/import/normalize";
import { parseStatement } from "@/server/import/parsers";
import type { ImportConfig, NormalizedRow, RawTable } from "@/server/import/types";
import { inTransaction, UserError, writeAudit, type Db } from "./common";
import { loadSortedRules } from "./rules";
import { detectTransfers } from "./transfer-detection";

/**
 * Importación de extractos (docs/ARQUITECTURA.md §5). Flujo:
 *   subir -> Import PREVIEW (guarda el fichero) -> mapeo -> vista previa
 *   -> confirmar (transacción única) -> COMMITTED  ...  -> deshacer (REVERTED)
 * La vista previa y la confirmación ejecutan EXACTAMENTE el mismo cálculo.
 */

interface StoredMapping {
  config: ImportConfig;
  /** Saldo inicial de la cuenta antes/después de ajustarlo con el extracto (para deshacer). */
  appliedOpening?: { before: { balance: number; date: string }; after: { balance: number; date: string } };
}

function readMapping(imp: Import): StoredMapping {
  return JSON.parse(imp.mapping) as StoredMapping;
}

// -----------------------------------------------------------------------------
// Subida
// -----------------------------------------------------------------------------

export async function createImportFromUpload(
  db: Db,
  userId: string,
  input: { accountId: string; fileName: string; bytes: Uint8Array },
): Promise<{ imp: Import; previous: Import | null }> {
  const account = await db.account.findFirst({ where: { id: input.accountId, userId } });
  if (!account) throw new UserError("Elige la cuenta a la que pertenece el extracto.", { accountId: "Obligatorio" });
  if (balanceMethod(account.type) === "DECLARED") {
    throw new UserError("Esta cuenta se valora con saldos manuales; no admite movimientos importados.");
  }

  const { kind, table } = await parseStatement(input.bytes, input.fileName);
  const fileHash = createHash("sha256").update(input.bytes).digest("hex");

  // ¿Formato conocido? Se busca un perfil con la misma firma de cabecera.
  const headerRow = detectHeaderRow(table);
  const signature = headerSignature(table, headerRow);
  const profile = await db.importProfile.findFirst({
    where: { userId, headerSignature: signature },
    orderBy: [{ accountId: "desc" }, { updatedAt: "desc" }],
  });
  const config: ImportConfig = profile
    ? { ...(JSON.parse(profile.config) as ImportConfig), headerRow, confirmed: false }
    : suggestConfig(table, headerRow);

  const previous = await db.import.findFirst({
    where: { userId, fileHash, status: "COMMITTED" },
    orderBy: { createdAt: "desc" },
  });

  const imp = await db.import.create({
    data: {
      userId,
      accountId: account.id,
      profileId: profile?.id ?? null,
      fileName: input.fileName.slice(0, 200),
      fileType: kind,
      fileHash,
      fileSize: input.bytes.length,
      fileData: Buffer.from(input.bytes),
      status: "PREVIEW",
      mapping: JSON.stringify({ config } satisfies StoredMapping),
    },
  });
  return { imp, previous };
}

export async function getImport(db: Db, userId: string, id: string) {
  const imp = await db.import.findFirst({
    where: { id, userId },
    include: { account: true, profile: { select: { id: true, name: true } } },
  });
  if (!imp) throw new UserError("La importación no existe.");
  return imp;
}

async function loadTable(imp: Import): Promise<RawTable> {
  if (!imp.fileData) throw new UserError("El fichero original de esta importación ya no está guardado.");
  return (await parseStatement(new Uint8Array(imp.fileData), imp.fileName)).table;
}

export async function listImports(db: Db, userId: string) {
  return db.import.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    omit: { fileData: true },
    include: { account: { select: { id: true, name: true } } },
    take: 100,
  });
}

// -----------------------------------------------------------------------------
// Mapeo
// -----------------------------------------------------------------------------

const col = z.number().int().min(0).nullable();
export const importConfigSchema = z.object({
  headerRow: z.number().int().min(0),
  columns: z.object({
    date: col,
    valueDate: col,
    description: z.array(z.number().int().min(0)),
    amount: col,
    debit: col,
    credit: col,
    balance: col,
    category: col,
  }),
  dateFormat: z.enum(DATE_FORMATS as [DateFormat, ...DateFormat[]]),
  decimalSeparator: z.enum([",", "."]),
  invertSign: z.boolean(),
  confirmed: z.boolean(),
});

export async function getMappingStep(db: Db, userId: string, id: string) {
  const imp = await getImport(db, userId, id);
  const table = await loadTable(imp);
  const { config } = readMapping(imp);
  const width = Math.max(0, ...table.rows.map((r) => r.length));
  return {
    imp,
    config,
    table,
    width,
    headers: headerLabels(table, config.headerRow),
    dateAmbiguous: config.columns.date !== null && isDateFormatAmbiguous(table, config),
  };
}

/** Guarda el mapeo. Con `redetect`, vuelve a proponer columnas para la fila de cabecera indicada. */
export async function saveImportConfig(
  db: Db,
  userId: string,
  id: string,
  input: ImportConfig,
  opts: { redetect?: boolean } = {},
) {
  const imp = await getImport(db, userId, id);
  if (imp.status !== "PREVIEW") throw new UserError("Esta importación ya no se puede modificar.");
  const parsed = importConfigSchema.safeParse(input);
  if (!parsed.success) throw new UserError("Configuración de columnas no válida.");
  let config = parsed.data;
  const table = await loadTable(imp);
  const width = Math.max(0, ...table.rows.map((r) => r.length));
  if (config.headerRow >= table.rows.length) throw new UserError("La fila de cabecera no existe.");

  if (opts.redetect) {
    config = { ...suggestConfig(table, config.headerRow), confirmed: false };
  } else {
    const c = config.columns;
    const all = [c.date, c.valueDate, c.amount, c.debit, c.credit, c.balance, c.category, ...c.description];
    if (all.some((x) => x !== null && x >= width)) throw new UserError("Hay columnas fuera de la tabla.");
    if (c.date === null) throw new UserError("Asigna la columna de fecha.", { date: "Obligatoria" });
    if (c.description.length === 0) throw new UserError("Asigna al menos una columna de descripción.", { description: "Obligatoria" });
    if (c.amount === null && c.debit === null && c.credit === null) {
      throw new UserError("Asigna la columna de importe, o las de cargo y abono.", { amount: "Obligatoria" });
    }
    if (c.amount !== null) {
      c.debit = null;
      c.credit = null;
    }
    config.confirmed = true;
  }
  await db.import.update({
    where: { id },
    data: { mapping: JSON.stringify({ ...readMapping(imp), config } satisfies StoredMapping) },
  });
  return config;
}

// -----------------------------------------------------------------------------
// Vista previa (mismo cálculo que la confirmación)
// -----------------------------------------------------------------------------

export type RowStatus = DedupStatus["status"];

export interface PreviewRow extends NormalizedRow {
  dedupHash: string;
  occurrence: number;
  dedup: DedupStatus;
  kind: TxKind;
  categoryId: string | null;
  subcategoryId: string | null;
  categoryLabel: string | null;
  ruleId: string | null;
  merchant: string | null;
  descriptionClean: string;
  /** Anterior al saldo inicial de la cuenta: se guarda pero no suma al saldo. */
  beforeOpening: boolean;
}

export interface ImportPreview {
  imp: Awaited<ReturnType<typeof getImport>>;
  config: ImportConfig;
  normalized: NormalizeResult;
  rows: PreviewRow[];
  counts: { detected: number; new: number; duplicate: number; probable: number; invalid: number };
  /** Conciliación prevista con el saldo final del extracto. */
  reconciliation: { date: Date; statement: number; computedAfter: number; difference: number } | null;
  /** Propuesta de saldo inicial deducida del extracto (si es fiable y útil). */
  openingSuggestion: { date: Date; balance: number; current: { date: Date; balance: number } } | null;
  suspectedInvertedSign: boolean;
  duplicatesOf: Map<string, { id: string; date: Date; amount: number; descriptionRaw: string }>;
}

export async function buildPreview(db: Db, userId: string, id: string, today: Date): Promise<ImportPreview> {
  const imp = await getImport(db, userId, id);
  const { config } = readMapping(imp);
  const table = await loadTable(imp);
  const normalized = normalizeTable(table, config, today);
  const account = imp.account;

  const hashed = assignDedupHashes(
    account.id,
    normalized.rows.map((r) => ({ ...r })),
  );

  const margin = PROBABLE_DUPLICATE_MAX_DAYS * 86_400_000;
  const existing =
    normalized.periodStart && normalized.periodEnd
      ? await db.transaction.findMany({
          where: {
            accountId: account.id,
            date: {
              gte: new Date(normalized.periodStart.getTime() - margin),
              lte: new Date(normalized.periodEnd.getTime() + margin),
            },
          },
          select: { id: true, date: true, amount: true, descriptionRaw: true, dedupHash: true },
        })
      : [];
  const classified = classifyRows(hashed, existing);
  const rules = await loadSortedRules(db, userId);

  const rows: PreviewRow[] = classified.map((r) => {
    const merchant = merchantKey(r.description) || null;
    const rule = findMatchingRule(rules, { accountId: account.id, amount: r.amount, description: r.description, merchant });
    return {
      ...r,
      kind: rule ? (rule.setKind ?? rule.categoryKind) : defaultKindForAmount(r.amount),
      categoryId: rule?.categoryId ?? null,
      subcategoryId: rule?.subcategoryId ?? null,
      categoryLabel: rule?.label ?? null,
      ruleId: rule?.id ?? null,
      merchant: rule?.setMerchant ?? merchant,
      descriptionClean: cleanDescription(r.description),
      beforeOpening: r.date.getTime() <= account.openingDate.getTime(),
    };
  });

  const counts = {
    detected: rows.length + normalized.invalid.length,
    new: rows.filter((r) => r.dedup.status === "NEW").length,
    duplicate: rows.filter((r) => r.dedup.status === "DUPLICATE").length,
    probable: rows.filter((r) => r.dedup.status === "PROBABLE_DUPLICATE").length,
    invalid: normalized.invalid.length,
  };

  // Conciliación prevista: saldo calculado tras importar las filas no duplicadas.
  let reconciliation: ImportPreview["reconciliation"] = null;
  const sb = normalized.statementBalance;
  if (sb && sb.date > account.openingDate) {
    const agg = await db.transaction.aggregate({
      where: { accountId: account.id, date: { gt: account.openingDate, lte: sb.date } },
      _sum: { amount: true },
    });
    const added = rows
      .filter((r) => r.dedup.status !== "DUPLICATE" && !r.beforeOpening && r.date <= sb.date)
      .reduce((s, r) => s + r.amount, 0);
    const computedAfter = account.openingBalance + (agg._sum.amount ?? 0) + added;
    reconciliation = { date: sb.date, statement: sb.balance, computedAfter, difference: sb.balance - computedAfter };
  }

  // Propuesta de saldo inicial: el extracto empieza en o antes del saldo inicial actual.
  let openingSuggestion: ImportPreview["openingSuggestion"] = null;
  const fromStatement = openingFromStatement(normalized);
  if (fromStatement && fromStatement.date < account.openingDate) {
    const earlier = await db.transaction.count({ where: { accountId: account.id, date: { lte: fromStatement.date } } });
    if (earlier === 0) {
      openingSuggestion = {
        ...fromStatement,
        current: { date: account.openingDate, balance: account.openingBalance },
      };
    }
  }

  const bc = normalized.balanceCheck;
  const suspectedInvertedSign = bc.checked >= 2 && bc.mismatches > bc.checked / 2 && bc.mismatchesIfInverted === 0;

  const dupIds = new Set<string>();
  for (const r of rows) {
    if (r.dedup.status === "DUPLICATE") dupIds.add(r.dedup.existingId);
    if (r.dedup.status === "PROBABLE_DUPLICATE") r.dedup.candidateIds.forEach((c) => dupIds.add(c));
  }
  const duplicatesOf = new Map(existing.filter((e) => dupIds.has(e.id)).map((e) => [e.id, e]));

  return { imp, config, normalized, rows, counts, reconciliation, openingSuggestion, suspectedInvertedSign, duplicatesOf };
}

// -----------------------------------------------------------------------------
// Confirmar
// -----------------------------------------------------------------------------

export interface CommitOptions {
  /** Filas (rowIndex) que el usuario ha desmarcado. Los duplicados exactos nunca se importan. */
  excludeRows: number[];
  /** Ajustar el saldo inicial de la cuenta con el deducido del extracto. */
  adjustOpening: boolean;
  /** Guardar el mapeo como perfil reutilizable con este nombre. */
  saveProfileName?: string;
}

export interface CommitResult {
  inserted: number;
  flagged: number;
  duplicate: number;
  skipped: number;
  balanceDifference: number | null;
  transfersLinked: number;
  transfersFlagged: number;
}

export async function commitImport(
  db: Db,
  userId: string,
  id: string,
  opts: CommitOptions,
  today: Date,
): Promise<CommitResult> {
  return inTransaction(db, async (tx) => {
    const preview = await buildPreview(tx, userId, id, today);
    const { imp, config, rows, normalized } = preview;
    if (imp.status !== "PREVIEW") throw new UserError("Esta importación ya se procesó.");
    if (!config.confirmed) throw new UserError("Confirma primero el mapeo de columnas.");
    if (rows.length === 0) throw new UserError("No hay ninguna operación válida que importar.");
    const account = imp.account;
    const excluded = new Set(opts.excludeRows);

    let appliedOpening: StoredMapping["appliedOpening"];
    if (opts.adjustOpening && preview.openingSuggestion) {
      const s = preview.openingSuggestion;
      const before = await tx.account.findUniqueOrThrow({ where: { id: account.id } });
      const after = await tx.account.update({
        where: { id: account.id },
        data: { openingBalance: s.balance, openingDate: s.date },
      });
      await writeAudit(tx, { userId, entity: "Account", entityId: account.id, action: "update", before, after });
      appliedOpening = {
        before: { balance: before.openingBalance, date: before.openingDate.toISOString() },
        after: { balance: s.balance, date: s.date.toISOString() },
      };
    }

    let inserted = 0;
    let flagged = 0;
    const insertedIds: string[] = [];
    let duplicate = 0;
    let skipped = normalized.invalid.length;
    const ruleUse = new Map<string, number>();

    for (const r of rows) {
      if (r.dedup.status === "DUPLICATE") {
        duplicate++;
        continue;
      }
      if (excluded.has(r.rowIndex)) {
        skipped++;
        continue;
      }
      const created = await tx.transaction.create({
        data: {
          userId,
          accountId: account.id,
          date: r.date,
          valueDate: r.valueDate,
          amount: r.amount,
          currency: account.currency,
          descriptionRaw: r.description,
          descriptionClean: r.descriptionClean,
          merchant: r.merchant,
          notes: r.bankCategory ? `Categoría del banco: ${r.bankCategory}` : null,
          kind: r.kind,
          categoryId: r.categoryId,
          subcategoryId: r.subcategoryId,
          categorizationSource: r.ruleId ? "RULE" : "NONE",
          ruleId: r.ruleId,
          balanceAfter: r.balanceAfter,
          dedupHash: r.dedupHash,
          occurrence: r.occurrence,
          source: "IMPORT",
          importId: imp.id,
          importRowIndex: r.rowIndex,
          reviewed: false,
        },
      });
      inserted++;
      insertedIds.push(created.id);
      if (r.ruleId) ruleUse.set(r.ruleId, (ruleUse.get(r.ruleId) ?? 0) + 1);
      if (r.dedup.status === "PROBABLE_DUPLICATE") {
        flagged++;
        const candidate = preview.duplicatesOf.get(r.dedup.candidateIds[0]!);
        await tx.reviewFlag.create({
          data: {
            userId,
            type: "POSSIBLE_DUPLICATE",
            message: candidate
              ? `Posible duplicado de «${candidate.descriptionRaw}» del ${formatDateES(candidate.date)} (mismo importe).`
              : "Posible duplicado de otra operación con el mismo importe.",
            transactionId: created.id,
            relatedTransactionId: r.dedup.candidateIds[0] ?? null,
            accountId: account.id,
            importId: imp.id,
            data: JSON.stringify({ candidateIds: r.dedup.candidateIds }),
          },
        });
      }
    }

    for (const [ruleId, n] of ruleUse) {
      await tx.categorizationRule.update({ where: { id: ruleId }, data: { timesApplied: { increment: n } } });
    }

    // Transferencias internas con otras cuentas propias (vincula o avisa).
    const transfers = insertedIds.length ? await detectTransfers(tx, userId, { onlyIds: insertedIds }) : { linked: 0, flagged: 0 };

    // Saldo final del extracto como saldo declarado (nunca sobrescribe uno existente).
    let balanceDifference: number | null = null;
    const sb = normalized.statementBalance;
    if (sb) {
      const existing = await tx.accountBalance.findUnique({
        where: { accountId_date_source: { accountId: account.id, date: sb.date, source: "IMPORT" } },
      });
      if (!existing) {
        await tx.accountBalance.create({
          data: { accountId: account.id, date: sb.date, balance: sb.balance, source: "IMPORT", importId: imp.id },
        });
      }
      const acc = await tx.account.findUniqueOrThrow({ where: { id: account.id } });
      if (sb.date > acc.openingDate) {
        const agg = await tx.transaction.aggregate({
          where: { accountId: account.id, date: { gt: acc.openingDate, lte: sb.date } },
          _sum: { amount: true },
        });
        const computed = acc.openingBalance + (agg._sum.amount ?? 0);
        balanceDifference = sb.balance - computed;
        if (balanceDifference !== 0) {
          await tx.reviewFlag.create({
            data: {
              userId,
              type: "BALANCE_MISMATCH",
              message: `El saldo del extracto a ${formatDateES(sb.date)} no coincide con el calculado por la aplicación.`,
              accountId: account.id,
              importId: imp.id,
              data: JSON.stringify({ date: sb.date, statement: sb.balance, computed, difference: balanceDifference }),
            },
          });
        }
      }
    }

    let profileId = imp.profileId;
    const profileName = opts.saveProfileName?.trim();
    if (profileName) {
      const table = await loadTable(imp);
      const data = {
        config: JSON.stringify({ ...config, confirmed: false }),
        headerSignature: headerSignature(table, config.headerRow),
        accountId: account.id,
      };
      const profile = await tx.importProfile.upsert({
        where: { userId_name: { userId, name: profileName.slice(0, 80) } },
        create: { userId, name: profileName.slice(0, 80), ...data },
        update: data,
      });
      profileId = profile.id;
    }

    await tx.import.update({
      where: { id: imp.id },
      data: {
        status: "COMMITTED",
        committedAt: new Date(),
        profileId,
        mapping: JSON.stringify({ config, appliedOpening } satisfies StoredMapping),
        rowsTotal: preview.counts.detected,
        rowsNew: inserted,
        rowsDuplicate: duplicate,
        rowsFlagged: flagged,
        rowsSkipped: skipped,
        periodStart: normalized.periodStart,
        periodEnd: normalized.periodEnd,
        statementBalance: sb?.balance ?? null,
        statementBalanceDate: sb?.date ?? null,
      },
    });
    await writeAudit(tx, {
      userId,
      entity: "Import",
      entityId: imp.id,
      action: "create",
      after: { fileName: imp.fileName, inserted, flagged, duplicate, skipped, transfers },
    });

    return { inserted, flagged, duplicate, skipped, balanceDifference, transfersLinked: transfers.linked, transfersFlagged: transfers.flagged };
  });
}

// -----------------------------------------------------------------------------
// Deshacer / descartar
// -----------------------------------------------------------------------------

export async function revertImport(db: Db, userId: string, id: string): Promise<{ deleted: number }> {
  return inTransaction(db, async (tx) => {
    const imp = await tx.import.findFirst({ where: { id, userId }, omit: { fileData: true } });
    if (!imp) throw new UserError("La importación no existe.");
    if (imp.status !== "COMMITTED") throw new UserError("Solo se pueden deshacer importaciones confirmadas.");

    const txs = await tx.transaction.findMany({ where: { importId: id }, select: { id: true, transferPeerId: true } });
    const ids = new Set(txs.map((t) => t.id));
    // Las parejas de transferencia en OTRAS importaciones/cuentas quedan desvinculadas.
    const outsidePeers = txs.map((t) => t.transferPeerId).filter((p): p is string => !!p && !ids.has(p));
    for (const peerId of outsidePeers) {
      const peer = await tx.transaction.findUniqueOrThrow({ where: { id: peerId } });
      await tx.transaction.update({
        where: { id: peerId },
        data: {
          transferPeerId: null,
          kind: defaultKindForAmount(peer.amount),
          categoryId: null,
          subcategoryId: null,
          categorizationSource: "NONE",
          reviewed: false,
        },
      });
    }
    await tx.transaction.updateMany({ where: { importId: id }, data: { transferPeerId: null } });
    await tx.reviewFlag.deleteMany({ where: { importId: id } });
    const { count } = await tx.transaction.deleteMany({ where: { importId: id } });
    await tx.accountBalance.deleteMany({ where: { importId: id } });

    // Restaurar el saldo inicial si esta importación lo cambió y nadie lo ha tocado después.
    const mapping = JSON.parse(imp.mapping) as StoredMapping;
    if (mapping.appliedOpening) {
      const acc = await tx.account.findUniqueOrThrow({ where: { id: imp.accountId } });
      const a = mapping.appliedOpening.after;
      if (acc.openingBalance === a.balance && acc.openingDate.toISOString() === a.date) {
        const after = await tx.account.update({
          where: { id: acc.id },
          data: { openingBalance: mapping.appliedOpening.before.balance, openingDate: new Date(mapping.appliedOpening.before.date) },
        });
        await writeAudit(tx, { userId, entity: "Account", entityId: acc.id, action: "update", before: acc, after });
      }
    }

    await tx.import.update({ where: { id }, data: { status: "REVERTED", revertedAt: new Date() } });
    await writeAudit(tx, { userId, entity: "Import", entityId: id, action: "delete", before: { deleted: count } });
    return { deleted: count };
  });
}

export async function discardPreview(db: Db, userId: string, id: string) {
  const r = await db.import.deleteMany({ where: { id, userId, status: "PREVIEW" } });
  if (r.count === 0) throw new UserError("Solo se pueden descartar importaciones pendientes.");
}


/** Vuelve al paso de mapeo (sin perder la configuración actual). */
export async function reopenMapping(db: Db, userId: string, id: string) {
  const imp = await getImport(db, userId, id);
  if (imp.status !== "PREVIEW") throw new UserError("Esta importación ya no se puede modificar.");
  const mapping = readMapping(imp);
  await db.import.update({
    where: { id },
    data: { mapping: JSON.stringify({ ...mapping, config: { ...mapping.config, confirmed: false } } satisfies StoredMapping) },
  });
}

export async function listImportProfiles(db: Db, userId: string) {
  return db.importProfile.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: { account: { select: { name: true } }, _count: { select: { imports: true } } },
  });
}

/** Borrar un perfil no afecta a importaciones pasadas (guardan su propio mapeo). */
export async function deleteImportProfile(db: Db, userId: string, id: string) {
  const r = await db.importProfile.deleteMany({ where: { id, userId } });
  if (r.count === 0) throw new UserError("El formato no existe.");
}
