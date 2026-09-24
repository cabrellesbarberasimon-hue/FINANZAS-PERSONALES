import { describe, expect, it } from "vitest";
import {
  detectDecimalSeparator,
  formatMoney,
  formatPercent,
  parseAmount,
  percentage,
} from "@/domain/money";

describe("parseAmount (formato español por defecto)", () => {
  it.each([
    ["1.234,56", 123456],
    ["-1.234,56", -123456],
    ["1234,5", 123450],
    ["12,00 €", 1200],
    ["12,00-", -1200],
    ["(12,00)", -1200],
    ["+3,40", 340],
    ["−3,40", -340],
    ["0,00", 0],
    ["-0,00", 0],
    ["  1 234,56  ", 123456],
    ["1.000.000,01", 100000001],
    ["42", 4200],
  ])("%s -> %i céntimos", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it("formato anglosajón con separador '.'", () => {
    expect(parseAmount("1,234.56", ".")).toBe(123456);
    expect(parseAmount("-45.5", ".")).toBe(-4550);
  });

  it("redondea a céntimo con más de 2 decimales (half away from zero)", () => {
    expect(parseAmount("1,005")).toBe(101);
    expect(parseAmount("-1,005")).toBe(-101);
    expect(parseAmount("1,004")).toBe(100);
  });

  it("acepta números nativos de Excel sin errores de coma flotante", () => {
    expect(parseAmount(12.34)).toBe(1234);
    expect(parseAmount(-0.1 - 0.2)).toBe(-30);
    expect(parseAmount(1234.5649999999)).toBe(123456);
  });

  it("rechaza texto que no es un importe", () => {
    for (const bad of ["", "abc", "12,34,56", "1,2.3", null, undefined, Number.NaN]) {
      expect(parseAmount(bad as never)).toBeNull();
    }
  });
});

describe("detectDecimalSeparator", () => {
  it("detecta coma decimal", () => {
    expect(detectDecimalSeparator(["-12,50", "1.234,00", "3"])).toBe(",");
  });
  it("detecta punto decimal", () => {
    expect(detectDecimalSeparator(["-12.50", "1,234.00", "3"])).toBe(".");
  });
  it("sin evidencia usa el valor por defecto", () => {
    expect(detectDecimalSeparator(["12", "300"])).toBe(",");
  });
});

describe("formato", () => {
  it("formatMoney agrupa miles al estilo español", () => {
    expect(formatMoney(345000).replace(/\s/g, " ")).toBe("3.450,00 €");
    expect(formatMoney(-123456).replace(/\s/g, " ")).toBe("-1.234,56 €");
    expect(formatMoney(125000, { decimals: 0, signed: true }).replace(/\s/g, " ")).toBe("+1.250 €");
  });
  it("percentage devuelve null si el denominador es 0", () => {
    expect(percentage(10, 0)).toBeNull();
    expect(percentage(1250, 10000)).toBe(12.5);
  });
  it("formatPercent muestra 'Pendiente de datos' sin dato", () => {
    expect(formatPercent(null)).toBe("Pendiente de datos");
    expect(formatPercent(12.5, { signed: true })).toBe("+12,5 %");
  });
});
