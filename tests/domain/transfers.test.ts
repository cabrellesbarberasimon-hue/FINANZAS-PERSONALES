import { describe, expect, it } from "vitest";
import { utcDate } from "@/domain/dates";
import { canLinkTransfer, findTransferCandidates } from "@/domain/transfers";
import { checkKindAmount } from "@/domain/transactions";

const out = { id: "a", accountId: "banco", date: utcDate(2026, 3, 1), amount: -50000, transferPeerId: null };

describe("transferencias internas", () => {
  it("-500 € en el banco y +500 € en el broker se pueden vincular", () => {
    expect(canLinkTransfer(out, { ...out, id: "b", accountId: "broker", amount: 50000 })).toEqual({ ok: true });
  });
  it("rechaza misma cuenta, importes distintos, ya vinculados o fechas lejanas", () => {
    expect(canLinkTransfer(out, { ...out, id: "b", amount: 50000 }).ok).toBe(false);
    expect(canLinkTransfer(out, { ...out, id: "b", accountId: "broker", amount: 49999 }).ok).toBe(false);
    expect(canLinkTransfer(out, { ...out, id: "b", accountId: "broker", amount: -50000 }).ok).toBe(false);
    expect(canLinkTransfer(out, { ...out, id: "b", accountId: "broker", amount: 50000, transferPeerId: "z" }).ok).toBe(false);
    expect(canLinkTransfer(out, { ...out, id: "b", accountId: "broker", amount: 50000, date: utcDate(2026, 3, 10) }).ok).toBe(false);
  });
  it("candidatas ordenadas por cercanía de fecha", () => {
    const pool = [
      { ...out, id: "lejos", accountId: "broker", amount: 50000, date: utcDate(2026, 3, 4) },
      { ...out, id: "cerca", accountId: "ahorro", amount: 50000, date: utcDate(2026, 3, 2) },
      { ...out, id: "otro-importe", accountId: "ahorro", amount: 40000 },
    ];
    expect(findTransferCandidates(out, pool).map((c) => c.id)).toEqual(["cerca", "lejos"]);
  });
});

describe("coherencia tipo/importe", () => {
  it("un ingreso negativo es un error; un gasto positivo es un reembolso", () => {
    expect(checkKindAmount("INCOME", -100).ok).toBe(false);
    const r = checkKindAmount("EXPENSE", 100);
    expect(r.ok && r.warning).toBeTruthy();
    expect(checkKindAmount("EXPENSE", 0).ok).toBe(false);
  });
});
