import { describe, expect, it } from "vitest";
import { cleanDescription, descriptionSimilarity, merchantKey, normalizeForHash } from "@/domain/text";

describe("normalización de descripciones", () => {
  it("normalizeForHash solo quita diferencias sin significado", () => {
    expect(normalizeForHash("  Pago  cafetería   Él ")).toBe("PAGO CAFETERIA EL");
  });
  it("cleanDescription quita ruido de tarjeta", () => {
    expect(cleanDescription("COMPRA TARJ. 4012XXXX1234 MERCADONA VALENCIA")).toBe("MERCADONA VALENCIA");
  });
  it("merchantKey agrupa variantes del mismo comercio", () => {
    expect(merchantKey("COMPRA TARJ. 4012XXXX1234 MERCADONA VALENCIA")).toBe("MERCADONA VALENCIA");
    expect(merchantKey("Netflix.com 866-579-7172")).toBe("NETFLIX");
    expect(merchantKey("MERCADONA SA 0123")).toBe("MERCADONA");
  });
  it("descriptionSimilarity", () => {
    expect(descriptionSimilarity("MERCADONA VALENCIA", "Mercadona  valencia")).toBe(1);
    expect(descriptionSimilarity("MERCADONA", "REPSOL")).toBe(0);
  });
});
