import { UserError } from "@/server/services/common";
import type { RawTable, StatementParser } from "../types";
import { csvParser } from "./csv";
import { xlsxParser } from "./xlsx";

/**
 * Lectores registrados, por orden de preferencia. Para añadir un formato
 * nuevo (PDF, OFX, Norma 43...) basta con implementar StatementParser y
 * añadirlo aquí.
 */
export const PARSERS: StatementParser[] = [xlsxParser, csvParser];

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // .xls binario (Excel 97-2003)

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 10_000;

export async function parseStatement(bytes: Uint8Array, fileName: string): Promise<{ kind: StatementParser["kind"]; table: RawTable }> {
  if (bytes.length === 0) throw new UserError("El fichero está vacío.");
  if (bytes.length > MAX_FILE_BYTES) throw new UserError("El fichero supera 5 MB. Divide el extracto en periodos más cortos.");
  if (OLE_MAGIC.every((b, i) => bytes[i] === b)) {
    throw new UserError(
      "Es un Excel antiguo (.xls). Ábrelo con Excel o LibreOffice y guárdalo como «Libro de Excel (.xlsx)» o como CSV, y súbelo de nuevo.",
    );
  }
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<")) {
    throw new UserError(
      "El fichero es una página HTML aunque tenga extensión de Excel. Ábrelo con Excel o LibreOffice y guárdalo como .xlsx o CSV.",
    );
  }
  if (head.startsWith("%pdf")) {
    throw new UserError("La importación de PDF aún no está disponible. Descarga el extracto en CSV o Excel.");
  }
  const parser = PARSERS.find((p) => p.canParse(bytes, fileName));
  if (!parser) throw new UserError("Formato no reconocido. Formatos admitidos: CSV y XLSX.");
  let table: RawTable;
  try {
    table = await parser.parse(bytes);
  } catch (e) {
    throw new UserError(`No se pudo leer el fichero (${parser.kind.toUpperCase()}): ${(e as Error).message}`);
  }
  if (table.rows.length > MAX_ROWS) throw new UserError(`El fichero tiene más de ${MAX_ROWS} filas.`);
  if (!table.rows.some((r) => r.some((c) => c !== null))) throw new UserError("El fichero no contiene datos.");
  return { kind: parser.kind, table };
}
