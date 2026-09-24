import { describe, expect, it } from "vitest";
import { findMatchingRule, isValidRulePattern, sortRules, type RuleLike } from "@/domain/rules";

const rule = (over: Partial<RuleLike>): RuleLike => ({
  id: over.pattern ?? "r",
  field: "DESCRIPTION",
  matchType: "CONTAINS",
  pattern: "X",
  accountId: null,
  amountMin: null,
  amountMax: null,
  categoryId: "cat",
  subcategoryId: null,
  categoryKind: "EXPENSE",
  setKind: null,
  setMerchant: null,
  priority: 0,
  origin: "SYSTEM",
  active: true,
  ...over,
});

const tx = (description: string, amount = -1000) => ({ accountId: "a", amount, description, merchant: null });

describe("reglas de categorización", () => {
  it("CONTAINS por palabra completa, sin acentos ni mayúsculas", () => {
    const rules = sortRules([rule({ pattern: "MERCADONA" }), rule({ pattern: "DIA " })]);
    expect(findMatchingRule(rules, tx("Compra Mercadona Valencia"))?.pattern).toBe("MERCADONA");
    expect(findMatchingRule(rules, tx("SUPERMERCADOS DIA 1234"))?.pattern).toBe("DIA ");
    expect(findMatchingRule(rules, tx("MEDIA MARKT"))).toBeNull();
    expect(findMatchingRule(rules, tx("NETFLIX.COM"))).toBeNull();
  });

  it("gana la regla del usuario sobre la del sistema, y luego la más específica", () => {
    const rules = sortRules([
      rule({ pattern: "UBER", categoryId: "transporte" }),
      rule({ pattern: "UBER EATS", categoryId: "comida" }),
      rule({ pattern: "AMAZON", categoryId: "sistema" }),
      rule({ pattern: "AMAZON", categoryId: "usuario", origin: "USER", id: "u" }),
    ]);
    expect(findMatchingRule(rules, tx("UBER EATS MADRID"))?.categoryId).toBe("comida");
    expect(findMatchingRule(rules, tx("UBER BV"))?.categoryId).toBe("transporte");
    expect(findMatchingRule(rules, tx("AMAZON EU SARL"))?.categoryId).toBe("usuario");
  });

  it("una categoría de ingresos no se aplica a una salida de dinero", () => {
    const rules = [rule({ pattern: "NOMINA", categoryKind: "INCOME" })];
    expect(findMatchingRule(rules, tx("NOMINA ACME", 250000))).not.toBeNull();
    expect(findMatchingRule(rules, tx("DEVOLUCION NOMINA ACME", -250000))).toBeNull();
  });

  it("condiciones de cuenta, importe, inactivas y regex", () => {
    expect(findMatchingRule([rule({ pattern: "X", accountId: "b" })], tx("X"))).toBeNull();
    expect(findMatchingRule([rule({ pattern: "X", amountMin: 2000 })], tx("X", -1000))).toBeNull();
    expect(findMatchingRule([rule({ pattern: "X", amountMax: 2000 })], tx("X", -1000))).not.toBeNull();
    expect(findMatchingRule([rule({ pattern: "X", active: false })], tx("X"))).toBeNull();
    expect(findMatchingRule([rule({ pattern: "^recibo .*seguro", matchType: "REGEX" })], tx("RECIBO MAPFRE SEGURO"))).not.toBeNull();
    expect(findMatchingRule([rule({ pattern: "EXACTO", matchType: "EQUALS" })], tx("EXACTO 2"))).toBeNull();
  });

  it("valida patrones", () => {
    expect(isValidRulePattern("REGEX", "(")).toBe(false);
    expect(isValidRulePattern("CONTAINS", "   ")).toBe(false);
    expect(isValidRulePattern("CONTAINS", "REPSOL")).toBe(true);
  });
});
