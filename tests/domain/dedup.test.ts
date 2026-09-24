import { describe, expect, it } from "vitest";
import { utcDate } from "@/domain/dates";
import { assignDedupHashes, classifyRows, computeDedupHash, type ExistingTx } from "@/domain/dedup";

const ACC = "acc_1";
const d = (day: number) => utcDate(2026, 3, day);

const statement = [
  { date: d(1), amount: -150, description: "CAFE BAR PEPE" },
  { date: d(1), amount: -150, description: "CAFE BAR PEPE" }, // 2º café legítimo
  { date: d(2), amount: -4523, description: "MERCADONA VALENCIA" },
  { date: d(3), amount: 250000, description: "NOMINA ACME SL" },
];

function asExisting(rows: ReturnType<typeof assignDedupHashes<(typeof statement)[number]>>): ExistingTx[] {
  return rows.map((r, i) => ({
    id: `tx_${i}`,
    date: r.date,
    amount: r.amount,
    descriptionRaw: r.description,
    dedupHash: r.dedupHash,
  }));
}

describe("hash de deduplicación", () => {
  it("es determinista e ignora mayúsculas/espacios/acentos", () => {
    const base = { accountId: ACC, date: d(2), amount: -4523, description: "MERCADONA VALENCIA" };
    expect(computeDedupHash(base, 0)).toBe(computeDedupHash({ ...base, description: " mercadona   valencia" }, 0));
  });
  it("cambia con cuenta, fecha, importe, concepto u ocurrencia", () => {
    const base = { accountId: ACC, date: d(2), amount: -4523, description: "MERCADONA" };
    const h = computeDedupHash(base, 0);
    expect(computeDedupHash({ ...base, accountId: "acc_2" }, 0)).not.toBe(h);
    expect(computeDedupHash({ ...base, date: d(3) }, 0)).not.toBe(h);
    expect(computeDedupHash({ ...base, amount: -4524 }, 0)).not.toBe(h);
    expect(computeDedupHash({ ...base, description: "LIDL" }, 0)).not.toBe(h);
    expect(computeDedupHash(base, 1)).not.toBe(h);
  });
  it("dos operaciones idénticas el mismo día reciben ocurrencias distintas", () => {
    const rows = assignDedupHashes(ACC, statement);
    expect(rows[0]!.occurrence).toBe(0);
    expect(rows[1]!.occurrence).toBe(1);
    expect(rows[0]!.dedupHash).not.toBe(rows[1]!.dedupHash);
  });
});

describe("importar dos veces el mismo extracto", () => {
  it("todas las filas se detectan como duplicado exacto", () => {
    const first = assignDedupHashes(ACC, statement);
    const second = classifyRows(assignDedupHashes(ACC, statement), asExisting(first));
    expect(second.map((r) => r.dedup.status)).toEqual(["DUPLICATE", "DUPLICATE", "DUPLICATE", "DUPLICATE"]);
  });

  it("extracto solapado: solo las filas nuevas son NEW", () => {
    const first = assignDedupHashes(ACC, statement);
    const overlapping = [
      ...statement.slice(2),
      { date: d(10), amount: -1299, description: "NETFLIX.COM" },
    ];
    const res = classifyRows(assignDedupHashes(ACC, overlapping), asExisting(first));
    expect(res.map((r) => r.dedup.status)).toEqual(["DUPLICATE", "DUPLICATE", "NEW"]);
  });

  it("si el extracto anterior solo traía un café, el segundo café es NEW", () => {
    const first = assignDedupHashes(ACC, statement.slice(0, 1));
    const res = classifyRows(assignDedupHashes(ACC, statement.slice(0, 2)), asExisting(first));
    expect(res.map((r) => r.dedup.status)).toEqual(["DUPLICATE", "NEW"]);
  });
});

describe("duplicados probables", () => {
  it("mismo importe, fecha cercana y concepto parecido -> PROBABLE_DUPLICATE (no se descarta)", () => {
    const first = assignDedupHashes(ACC, [{ date: d(2), amount: -4523, description: "MERCADONA VALENCIA" }]);
    const res = classifyRows(
      assignDedupHashes(ACC, [{ date: d(3), amount: -4523, description: "COMPRA MERCADONA VALENCIA" }]),
      asExisting(first),
    );
    expect(res[0]!.dedup).toEqual({ status: "PROBABLE_DUPLICATE", candidateIds: ["tx_0"] });
  });

  it("mismo importe pero concepto distinto y días distintos -> NEW", () => {
    const first = assignDedupHashes(ACC, [{ date: d(2), amount: -4523, description: "MERCADONA" }]);
    const res = classifyRows(
      assignDedupHashes(ACC, [{ date: d(4), amount: -4523, description: "REPSOL" }]),
      asExisting(first),
    );
    expect(res[0]!.dedup.status).toBe("NEW");
  });

  it("una operación ya casada exactamente no se usa como candidata probable", () => {
    const first = assignDedupHashes(ACC, [{ date: d(2), amount: -4523, description: "MERCADONA" }]);
    const res = classifyRows(
      assignDedupHashes(ACC, [
        { date: d(2), amount: -4523, description: "MERCADONA" },
        { date: d(3), amount: -4523, description: "MERCADONA" },
      ]),
      asExisting(first),
    );
    expect(res.map((r) => r.dedup.status)).toEqual(["DUPLICATE", "NEW"]);
  });
});
