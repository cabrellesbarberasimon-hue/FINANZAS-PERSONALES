import writeXlsxFile from "write-excel-file/node";
import { utcDate } from "@/domain/dates";

/** Genera en memoria un XLSX como los de un banco: título, cabecera, fechas y números nativos. */
export async function makeBankXlsx(): Promise<Uint8Array> {
  const rows = [
    ["Movimientos de la cuenta", null, null, null],
    [null, null, null, null],
    ["Fecha", "Concepto", "Importe", "Saldo"],
    [utcDate(2026, 9, 1), "NOMINA EMPRESA FICTICIA", 2450, 3450],
    [utcDate(2026, 9, 3), "MERCADONA VALENCIA", -45.23, 3404.77],
    [utcDate(2026, 9, 5), "NETFLIX.COM", -12.99, 3391.78],
  ];
  const r = writeXlsxFile(rows as never, { dateFormat: "dd/mm/yyyy" });
  return new Uint8Array(await r.toBuffer());
}
