import { describe, expect, it } from "vitest";
import { utcDate } from "@/domain/dates";
import { suggestRules, type Correction } from "@/domain/learning";
import type { RuleLike } from "@/domain/rules";
import { decideTransfers, hasTransferKeyword } from "@/domain/transfers";

const corr = (merchantKey: string, categoryId: string, day: number, extra: Partial<Correction> = {}): Correction => ({
  merchantKey, categoryId, subcategoryId: "sub", dismissed: false, createdAt: utcDate(2026, 9, day), ...extra,
});

describe("aprendizaje de reglas", () => {
  it("sugiere regla tras 3 correcciones iguales, no antes", () => {
    const two = [corr("MERCADONA", "super", 1), corr("MERCADONA", "super", 2)];
    expect(suggestRules(two, [])).toEqual([]);
    const three = [...two, corr("MERCADONA", "super", 3)];
    expect(suggestRules(three, [])).toMatchObject([{ merchantKey: "MERCADONA", categoryId: "super", count: 3 }]);
  });

  it("con correcciones contradictorias gana la categoría más repetida", () => {
    const c = [
      corr("AMAZON", "hogar", 1), corr("AMAZON", "hogar", 2), corr("AMAZON", "hogar", 3),
      corr("AMAZON", "tecno", 4), corr("AMAZON", "tecno", 5), corr("AMAZON", "tecno", 6), corr("AMAZON", "tecno", 7),
    ];
    expect(suggestRules(c, []).map((s) => s.categoryId)).toEqual(["tecno"]);
  });

  it("no sugiere si ya hay una regla del usuario equivalente, ni si se descartó", () => {
    const c = [corr("REPSOL", "fuel", 1), corr("REPSOL", "fuel", 2), corr("REPSOL", "fuel", 3)];
    const rule: RuleLike = {
      id: "r", field: "DESCRIPTION", matchType: "CONTAINS", pattern: "REPSOL", accountId: null, amountMin: null, amountMax: null,
      categoryId: "fuel", subcategoryId: "sub", categoryKind: "EXPENSE", setKind: null, setMerchant: null, priority: 0, origin: "USER", active: true,
    };
    expect(suggestRules(c, [rule])).toEqual([]);
    expect(suggestRules(c, [{ ...rule, origin: "SYSTEM" }])).toHaveLength(1); // la del sistema no lo impide: el usuario la contradice
    expect(suggestRules([...c, corr("REPSOL", "fuel", 4, { dismissed: true })], [])).toEqual([]);
  });
});

describe("detección de transferencias internas", () => {
  const t = (id: string, accountId: string, amount: number, day: number, description: string) => ({
    id, accountId, amount, date: utcDate(2026, 9, day), description, transferPeerId: null,
  });

  it("palabras clave", () => {
    expect(hasTransferKeyword("TRASPASO A CUENTA AHORRO")).toBe(true);
    expect(hasTransferKeyword("TRANSFERENCIA INMEDIATA")).toBe(true);
    expect(hasTransferKeyword("MERCADONA")).toBe(false);
    expect(hasTransferKeyword("TRANSFORMADOS SL")).toBe(false);
  });

  it("enlaza cuando la pareja es única, mutua y hay palabra clave", () => {
    const out = t("a", "banco", -50000, 1, "TRASPASO A BROKER");
    const inn = t("b", "broker", 50000, 2, "INGRESO");
    expect(decideTransfers([out], [inn])).toMatchObject([{ action: "LINK", peer: { id: "b" } }]);
  });

  it("sin palabra clave o con varias candidatas: solo marca para revisión", () => {
    const out = t("a", "banco", -50000, 1, "PAGO VARIOS");
    const inn = t("b", "broker", 50000, 2, "ABONO");
    expect(decideTransfers([out], [inn])).toMatchObject([{ action: "FLAG" }]);
    const out2 = t("c", "banco", -10000, 1, "TRASPASO");
    const c1 = t("d", "ahorro", 10000, 1, "TRASPASO");
    const c2 = t("e", "efectivo", 10000, 2, "INGRESO");
    expect(decideTransfers([out2], [c1, c2])).toMatchObject([{ action: "FLAG", candidates: [{ id: "d" }, { id: "e" }] }]);
  });

  it("sin candidatas no hace nada", () => {
    expect(decideTransfers([t("a", "banco", -1, 1, "TRASPASO")], [])).toEqual([]);
  });
});
