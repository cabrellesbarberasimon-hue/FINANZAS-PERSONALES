import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { toISODate, utcDate } from "@/domain/dates";
import { assignDedupHashes, classifyRows } from "@/domain/dedup";
import { detectHeaderRow, headerLabels, suggestConfig } from "@/server/import/detect";
import { normalizeTable, openingFromStatement } from "@/server/import/normalize";
import { parseStatement } from "@/server/import/parsers";
import { makeBankXlsx } from "../helpers/xlsx-fixture";

const fixture = (name: string) => new Uint8Array(readFileSync(path.resolve(__dirname, "../fixtures", name)));
const TODAY = utcDate(2026, 9, 24);

describe("banco A: CSV Windows-1252, ';', títulos antes de la cabecera, más reciente primero", () => {
  it("lee, detecta cabecera, columnas y formatos", async () => {
    const { kind, table } = await parseStatement(fixture("banco-a-latin1.csv"), "a.csv");
    expect(kind).toBe("csv");
    expect(table.meta).toMatchObject({ encoding: "windows-1252", delimiter: ";" });
    const header = detectHeaderRow(table);
    expect(headerLabels(table, header)).toEqual(["Fecha operación", "Fecha valor", "Concepto", "Importe", "Saldo"]);
    const config = suggestConfig(table, header);
    expect(config.columns).toMatchObject({ date: 0, valueDate: 1, description: [2], amount: 3, balance: 4 });
    expect(config.dateFormat).toBe("DD/MM/YYYY");
    expect(config.decimalSeparator).toBe(",");
  });

  it("normaliza en orden cronológico, con importes exactos y saldo coherente", async () => {
    const { table } = await parseStatement(fixture("banco-a-latin1.csv"), "a.csv");
    const r = normalizeTable(table, suggestConfig(table), TODAY);
    expect(r.fileOrder).toBe("descending");
    expect(r.rows.map((x) => x.amount)).toEqual([245000, -150, -150, -4523, -1299, -30000]);
    expect(r.rows[0]!.description).toBe("NÓMINA EMPRESA FICTICIA SL");
    expect(r.balanceCheck).toMatchObject({ checked: 5, mismatches: 0 });
    expect(r.statementBalance).toEqual({ date: utcDate(2026, 9, 6), balance: 308878 });
    expect(toISODate(r.periodStart!)).toBe("2026-09-01");
    // La fila "Saldo final" no se descarta en silencio.
    expect(r.invalid).toHaveLength(1);
    expect(r.invalid[0]!.reason).toMatch(/sin fecha/);
    expect(openingFromStatement(r)).toEqual({ date: utcDate(2026, 8, 31), balance: 100000 });
  });

  it("reimportar el mismo extracto: 0 nuevas, todas duplicadas (los dos cafés incluidos)", async () => {
    const { table } = await parseStatement(fixture("banco-a-latin1.csv"), "a.csv");
    const rows = normalizeTable(table, suggestConfig(table), TODAY).rows;
    const first = assignDedupHashes("acc", rows);
    const existing = first.map((r, i) => ({ id: `t${i}`, date: r.date, amount: r.amount, descriptionRaw: r.description, dedupHash: r.dedupHash }));
    const second = classifyRows(assignDedupHashes("acc", rows), existing);
    expect(second.filter((r) => r.dedup.status === "NEW")).toHaveLength(0);
    expect(second.filter((r) => r.dedup.status === "DUPLICATE")).toHaveLength(6);
  });
});

describe("banco B: CSV UTF-8 con BOM, ',', comillas, cargo/abono con punto decimal", () => {
  it("detecta cargo/abono y concatena descripción", async () => {
    const { table } = await parseStatement(fixture("banco-b-utf8.csv"), "b.csv");
    expect(table.meta.encoding).toBe("utf-8");
    expect(table.meta.delimiter).toBe(",");
    const config = suggestConfig(table);
    expect(config.columns).toMatchObject({ date: 0, amount: null, debit: 3, credit: 4, balance: 5, description: [1, 2] });
    expect(config.dateFormat).toBe("YYYY-MM-DD");
    expect(config.decimalSeparator).toBe(".");
    const r = normalizeTable(table, config, TODAY);
    expect(r.rows.map((x) => x.amount)).toEqual([245000, -4523, 2599, -6010]);
    expect(r.rows[0]!.description).toBe("NOMINA, EMPRESA FICTICIA Ref 001");
    expect(r.balanceCheck.mismatches).toBe(0);
  });
});

describe("XLSX", () => {
  it("lee fechas y números nativos de Excel", async () => {
    const { kind, table } = await parseStatement(await makeBankXlsx(), "c.xlsx");
    expect(kind).toBe("xlsx");
    const config = suggestConfig(table);
    expect(config.headerRow).toBe(2);
    const r = normalizeTable(table, config, TODAY);
    expect(r.rows.map((x) => [toISODate(x.date), x.amount])).toEqual([
      ["2026-09-01", 245000],
      ["2026-09-03", -4523],
      ["2026-09-05", -1299],
    ]);
    expect(r.balanceCheck).toMatchObject({ checked: 2, mismatches: 0 });
  });
});

describe("tarjeta con compras en positivo", () => {
  it("la coherencia de saldo no aplica, pero invertSign corrige los signos", async () => {
    const { table } = await parseStatement(fixture("tarjeta-positivos.csv"), "t.csv");
    const config = { ...suggestConfig(table), invertSign: true };
    expect(config.columns.description).toEqual([1]);
    const r = normalizeTable(table, config, TODAY);
    expect(r.rows.map((x) => x.amount)).toEqual([-3150, -3797, 3797]);
  });
});

describe("detección de signo invertido por el saldo", () => {
  it("si el saldo solo cuadra invirtiendo signos, se detecta", async () => {
    const { table } = await parseStatement(fixture("banco-a-latin1.csv"), "a.csv");
    const r = normalizeTable(table, { ...suggestConfig(table), invertSign: true }, TODAY);
    expect(r.balanceCheck.mismatches).toBe(5);
    expect(r.balanceCheck.mismatchesIfInverted).toBe(0);
  });
});

describe("formatos no admitidos", () => {
  it("XLS antiguo: mensaje para guardarlo como XLSX", async () => {
    await expect(parseStatement(fixture("antiguo.xls"), "x.xls")).rejects.toThrow(/xlsx/i);
  });
  it("HTML con extensión .xls", async () => {
    await expect(parseStatement(fixture("html-disfrazado.xls"), "x.xls")).rejects.toThrow(/HTML/);
  });
  it("fichero vacío", async () => {
    await expect(parseStatement(new Uint8Array(), "x.csv")).rejects.toThrow(/vacío/);
  });
});

describe("filas inválidas", () => {
  it("se informan con motivo, nunca se descartan en silencio", async () => {
    const csv = "Fecha;Concepto;Importe\n01/09/2026;OK;-1,00\n31/02/2026;FECHA MAL;-2,00\n02/09/2026;IMPORTE MAL;abc\n03/09/2026;CERO;0,00\n";
    const { table } = await parseStatement(new TextEncoder().encode(csv), "x.csv");
    const r = normalizeTable(table, suggestConfig(table), TODAY);
    expect(r.rows).toHaveLength(1);
    expect(r.invalid.map((i) => i.reason)).toEqual([
      expect.stringMatching(/Fecha no válida/),
      expect.stringMatching(/Importe no válido/),
      expect.stringMatching(/Importe 0/),
    ]);
  });
});
