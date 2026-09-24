import readXlsxFile from "read-excel-file/node";
import type { Cell, RawTable, StatementParser } from "../types";

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export const xlsxParser: StatementParser = {
  kind: "xlsx",
  canParse(bytes) {
    return ZIP_MAGIC.every((b, i) => bytes[i] === b);
  },
  async parse(bytes): Promise<RawTable> {
    const sheets = await readXlsxFile(Buffer.from(bytes));
    // Se usa la primera hoja con datos. Los extractos bancarios traen una sola.
    const sheet = sheets.find((s) => s.data.some((r) => r.some((c) => c !== null && c !== ""))) ?? sheets[0];
    const rows: Cell[][] = (sheet?.data ?? []).map((r) =>
      r.map((c) => {
        if (c === null || c === undefined) return null;
        if (typeof c === "string") return c.trim() === "" ? null : c.trim();
        return c as unknown as Cell;
      }),
    );
    return { rows, meta: { sheet: sheet?.sheet ?? "", sheets: String(sheets.length) } };
  },
};
