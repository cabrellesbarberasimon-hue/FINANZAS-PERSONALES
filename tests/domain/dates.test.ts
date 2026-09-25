import { describe, expect, it } from "vitest";
import {
  addMonths,
  detectDateFormat,
  excelSerialToDate,
  monthKey,
  monthRange,
  parseDate,
  toISODate,
} from "@/domain/dates";

describe("parseDate", () => {
  it("parsea formatos explícitos a medianoche UTC", () => {
    expect(toISODate(parseDate("03/04/2026", "DD/MM/YYYY")!)).toBe("2026-04-03");
    expect(toISODate(parseDate("03/04/2026", "MM/DD/YYYY")!)).toBe("2026-03-04");
    expect(toISODate(parseDate("2026-04-03", "YYYY-MM-DD")!)).toBe("2026-04-03");
    expect(toISODate(parseDate("03-04-26", "DD/MM/YY")!)).toBe("2026-04-03");
    expect(parseDate("03/04/2026", "DD/MM/YYYY")!.getUTCHours()).toBe(0);
  });
  it("rechaza fechas imposibles", () => {
    expect(parseDate("31/02/2026", "DD/MM/YYYY")).toBeNull();
    expect(parseDate("2026-13-01", "YYYY-MM-DD")).toBeNull();
    expect(parseDate("hola", "DD/MM/YYYY")).toBeNull();
  });
  it("convierte números de serie de Excel", () => {
    expect(toISODate(excelSerialToDate(46023)!)).toBe("2026-01-01");
    expect(toISODate(parseDate(46023, "DD/MM/YYYY")!)).toBe("2026-01-01");
  });
});

describe("detectDateFormat", () => {
  it("prefiere DD/MM y avisa de ambigüedad", () => {
    expect(detectDateFormat(["01/02/2026", "05/03/2026"])).toEqual({
      format: "DD/MM/YYYY",
      ambiguous: true,
    });
  });
  it("un día > 12 resuelve la ambigüedad", () => {
    expect(detectDateFormat(["01/02/2026", "25/03/2026"])).toEqual({
      format: "DD/MM/YYYY",
      ambiguous: false,
    });
    expect(detectDateFormat(["02/25/2026"]).format).toBe("MM/DD/YYYY");
  });
});

describe("meses", () => {
  it("monthKey, monthRange y addMonths", () => {
    expect(monthKey(parseDate("31/12/2026", "DD/MM/YYYY")!)).toBe("2026-12");
    const r = monthRange("2026-12");
    expect(toISODate(r.start)).toBe("2026-12-01");
    expect(toISODate(r.end)).toBe("2027-01-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", 14)).toBe("2028-01");
  });
});

import { monthLabel } from "@/domain/dates";
describe("monthLabel", () => {
  it("nombre del mes en español", () => expect(monthLabel("2026-09")).toBe("septiembre 2026"));
});
