import { describe, expect, it } from "vitest";
import { toISODate } from "@/domain/dates";
import { movementHref, parseMovementSearch } from "@/lib/transaction-filters";

describe("filtros de movimientos en la URL", () => {
  it("parsea y valida los parámetros", () => {
    const { filters, page } = parseMovementSearch({
      mes: "2026-09", tipo: "EXPENSE", categoria: "c1|s1", min: "10", max: "200,50",
      desde: "2026-09-01", pagina: "3", q: " mercadona ",
    });
    expect(filters.month).toBe("2026-09");
    expect(filters.kind).toBe("EXPENSE");
    expect(filters.categoryId).toBe("c1");
    expect(filters.subcategoryId).toBe("s1");
    expect(filters.minAmount).toBe(1000);
    expect(filters.maxAmount).toBe(20050);
    expect(toISODate(filters.from!)).toBe("2026-09-01");
    expect(filters.q).toBe("mercadona");
    expect(page).toBe(3);
  });
  it("ignora valores no válidos", () => {
    const { filters, page } = parseMovementSearch({ mes: "2026-13", tipo: "HACK", anio: "20", pagina: "-2" });
    expect(filters).toEqual({});
    expect(page).toBe(1);
  });
  it("categoría 'none' filtra sin categoría", () => {
    expect(parseMovementSearch({ categoria: "none|" }).filters.categoryId).toBe("none");
  });
  it("construye enlaces", () => {
    expect(movementHref({ mes: "2026-09", tipo: "EXPENSE" })).toBe("/movimientos?mes=2026-09&tipo=EXPENSE");
    expect(movementHref({})).toBe("/movimientos");
  });
});
