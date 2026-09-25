import type { PrismaClient } from "../src/generated/prisma/client";
import { assignDedupHashes } from "../src/domain/dedup";
import { addMonths, utcDate } from "../src/domain/dates";
import { cleanDescription, merchantKey } from "../src/domain/text";

/**
 * Datos FICTICIOS para desarrollo. Solo se ejecuta contra data/demo.db
 * (scripts/demo.ts lo garantiza). Deterministas: misma semilla -> mismos datos.
 *
 * Cuentas, movimientos (marzo-septiembre 2026), transferencias internas
 * vinculadas, saldos del banco (uno con descuadre a propósito para probar la
 * conciliación), una deuda e inversiones (fondo indexado con aportaciones
 * mensuales vinculadas al broker, plan de pensiones y un ETF con valoración
 * desactualizada a propósito).
 */

// PRNG determinista (mulberry32)
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Kind = "INCOME" | "EXPENSE" | "TRANSFER" | "INVESTMENT";

interface DemoTx {
  account: string;
  date: Date;
  amount: number;
  description: string;
  cat?: [string, string];
  kind: Kind;
  extraordinary?: boolean;
  /** Clave para emparejar transferencias. */
  pair?: string;
  /** Compra de fondo financiada por este cargo. */
  buy?: { fund: "global"; price: string };
}

const OPENING = utcDate(2026, 2, 28);
const LAST_DAY = utcDate(2026, 9, 24);

export async function seedDemoData(db: PrismaClient): Promise<void> {
  const user = await db.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  if ((await db.account.count({ where: { userId: user.id } })) > 0) {
    console.log("[demo] Ya hay datos demo. Usa `npm run demo:delete` y `npm run demo:setup` para regenerarlos.");
    return;
  }
  const userId = user.id;
  const rand = rng(20260924);
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min));

  const acc = async (name: string, type: "CHECKING" | "SAVINGS" | "CASH" | "CARD" | "BROKER" | "OTHER", institution: string, openingBalance: number) =>
    (await db.account.create({ data: { userId, name, type, institution, openingBalance, openingDate: OPENING } })).id;

  const principal = await acc("Cuenta Principal", "CHECKING", "Banco Demo", 320000);
  const ahorro = await acc("Cuenta Ahorro", "SAVINGS", "Banco Demo", 800000);
  const efectivo = await acc("Efectivo", "CASH", "Cartera", 12000);
  const tarjeta = await acc("Tarjeta Crédito", "CARD", "Banco Demo", -18000);
  const broker = await acc("Broker (efectivo)", "BROKER", "Broker Demo", 5000);
  const coche = await acc("Coche", "OTHER", "Valoración propia", 1200000);

  const txs: DemoTx[] = [];
  const add = (t: DemoTx) => {
    if (t.date <= LAST_DAY) txs.push(t);
  };
  const transfer = (from: string, to: string, date: Date, amount: number, descOut: string, descIn: string, key: string) => {
    add({ account: from, date, amount: -amount, description: descOut, kind: "TRANSFER", pair: key });
    add({ account: to, date, amount, description: descIn, kind: "TRANSFER", pair: key });
  };

  let prevCardSpend = 18000;
  let nav = 104.2;
  const navByMonth = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const month = addMonths("2026-03", i);
    const [y, m] = month.split("-").map(Number) as [number, number];
    const d = (day: number) => utcDate(y, m, day);

    add({ account: principal, date: d(1), amount: 245000, description: "NOMINA EMPRESA DEMO SL", cat: ["Ingresos", "Nómina"], kind: "INCOME" });
    add({ account: principal, date: d(2), amount: -75000, description: "RECIBO ALQUILER PISO C/ FICTICIA", cat: ["Vivienda", "Alquiler/hipoteca"], kind: "EXPENSE" });
    add({ account: principal, date: d(3), amount: -3990, description: "CUOTA GIMNASIO DEMOFIT", cat: ["Deporte", "Gimnasio"], kind: "EXPENSE" });
    add({ account: principal, date: d(5), amount: -between(4500, 7800), description: "RECIBO IBERDROLA CLIENTES", cat: ["Vivienda", "Luz"], kind: "EXPENSE" });
    add({ account: principal, date: d(8), amount: -3990, description: "MOVISTAR FIBRA", cat: ["Vivienda", "Internet"], kind: "EXPENSE" });
    add({ account: principal, date: d(10), amount: -1299, description: "NETFLIX.COM", cat: ["Ocio", "Suscripciones"], kind: "EXPENSE" });
    add({ account: principal, date: d(15), amount: -1099, description: "SPOTIFY P1234", cat: ["Ocio", "Suscripciones"], kind: "EXPENSE" });
    add({ account: principal, date: d(12), amount: -3000, description: "CUOTA FINANCIACION MOVIL", cat: ["Compras", "Tecnología"], kind: "EXPENSE" });

    for (let k = 0; k < 5; k++) {
      add({ account: principal, date: d(3 + k * 5), amount: -between(2500, 9500), description: `COMPRA TARJ. 4012XXXX1234 MERCADONA VALENCIA`, cat: ["Alimentación", "Supermercado"], kind: "EXPENSE" });
    }
    for (let k = 0; k < 3; k++) {
      add({ account: principal, date: d(6 + k * 7), amount: -between(1800, 5500), description: "RESTAURANTE LA TASCA DEMO", cat: ["Alimentación", "Restaurantes"], kind: "EXPENSE" });
    }
    add({ account: principal, date: d(9), amount: -between(4000, 6500), description: "REPSOL E.S. AVDA DEMO", cat: ["Transporte", "Combustible"], kind: "EXPENSE" });
    add({ account: principal, date: d(23), amount: -between(4000, 6500), description: "REPSOL E.S. AVDA DEMO", cat: ["Transporte", "Combustible"], kind: "EXPENSE" });
    // Sin categoría a propósito, para la revisión.
    add({ account: principal, date: d(18), amount: -between(900, 4000), description: "BIZUM A PEDRO FICTICIO", kind: "EXPENSE" });

    // Tarjeta: compras del mes y pago del mes anterior desde la cuenta principal.
    const c1 = between(2000, 8000);
    const c2 = between(1500, 6000);
    add({ account: tarjeta, date: d(11), amount: -c1, description: "AMAZON EU SARL", cat: ["Compras", "Hogar"], kind: "EXPENSE" });
    add({ account: tarjeta, date: d(20), amount: -c2, description: "ZARA ONLINE", cat: ["Compras", "Ropa"], kind: "EXPENSE" });
    transfer(principal, tarjeta, d(4), prevCardSpend, "LIQUIDACION TARJETA CREDITO", "PAGO RECIBIDO LIQUIDACION", `card-${month}`);
    prevCardSpend = c1 + c2;

    // Efectivo
    transfer(principal, efectivo, d(7), 10000, "RETIRADA CAJERO", "RETIRADA CAJERO CUENTA PRINCIPAL", `cash-${month}`);
    add({ account: efectivo, date: d(13), amount: -between(300, 1500), description: "CAFETERIA (efectivo)", cat: ["Alimentación", "Restaurantes"], kind: "EXPENSE" });
    add({ account: efectivo, date: d(21), amount: -between(1000, 4000), description: "MERCADILLO (efectivo)", cat: ["Alimentación", "Supermercado"], kind: "EXPENSE" });

    // Ahorro e intereses
    transfer(principal, ahorro, d(25), 30000, "TRASPASO A CUENTA AHORRO", "TRASPASO DESDE CUENTA PRINCIPAL", `sav-${month}`);
    add({ account: ahorro, date: d(28), amount: between(500, 800), description: "LIQUIDACION INTERESES", cat: ["Ingresos", "Intereses"], kind: "INCOME" });

    // Aportación al broker
    transfer(principal, broker, d(26), 30000, "TRANSFERENCIA A BROKER DEMO", "INGRESO DESDE BANCO DEMO", `brk-${month}`);
    // Con ese dinero, el broker compra participaciones del fondo indexado.
    nav = Math.round(nav * (1 + (rand() * 0.07 - 0.03)) * 100) / 100;
    navByMonth.set(month, nav);
    add({
      account: broker, date: d(27), amount: -30000, description: "SUSCRIPCION FONDO INDICE GLOBAL DEMO",
      cat: ["Inversiones", "Aportación fondo"], kind: "INVESTMENT", buy: { fund: "global", price: nav.toFixed(2) },
    });
  }
  // Extraordinarios
  add({ account: principal, date: utcDate(2026, 6, 30), amount: 31200, description: "DEVOLUCION AEAT IRPF 2025", cat: ["Ingresos", "Devolución"], kind: "INCOME", extraordinary: true });
  add({ account: tarjeta, date: utcDate(2026, 7, 14), amount: 2599, description: "DEVOLUCION AMAZON EU SARL", cat: ["Compras", "Hogar"], kind: "EXPENSE" });
  add({ account: tarjeta, date: utcDate(2026, 8, 3), amount: -64900, description: "RYANAIR VUELOS", cat: ["Ocio", "Viajes"], kind: "EXPENSE", extraordinary: true });

  // Resolver categorías
  const categories = await db.category.findMany({ where: { userId }, include: { subcategories: true } });
  const catIds = (pair?: [string, string]) => {
    if (!pair) return { categoryId: null, subcategoryId: null };
    const c = categories.find((x) => x.name === pair[0]);
    const s = c?.subcategories.find((x) => x.name === pair[1]);
    if (!c || !s) throw new Error(`Categoría demo desconocida: ${pair.join(" / ")}`);
    return { categoryId: c.id, subcategoryId: s.id };
  };
  const transferCat = catIds(["Transferencias", "Transferencia entre cuentas propias"]);

  // Insertar por cuenta con hash anti-duplicados, ordenado por fecha.
  const idByIndex = new Map<DemoTx, string>();
  for (const accountId of [principal, ahorro, efectivo, tarjeta, broker]) {
    const rows = txs.filter((t) => t.account === accountId).sort((a, b) => a.date.getTime() - b.date.getTime());
    const hashed = assignDedupHashes(accountId, rows);
    for (const [idx, r] of hashed.entries()) {
      const cat = r.kind === "TRANSFER" ? transferCat : catIds(r.cat);
      const created = await db.transaction.create({
        data: {
          userId,
          accountId,
          date: r.date,
          amount: r.amount,
          descriptionRaw: r.description,
          descriptionClean: cleanDescription(r.description),
          merchant: merchantKey(r.description) || null,
          kind: r.kind,
          ...cat,
          categorizationSource: cat.categoryId ? "MANUAL" : "NONE",
          isExtraordinary: r.extraordinary ?? false,
          dedupHash: r.dedupHash,
          occurrence: r.occurrence,
          source: "MANUAL",
          reviewed: cat.categoryId !== null,
          notes: "Dato ficticio (demo)",
        },
      });
      idByIndex.set(rows[idx]!, created.id);
    }
  }

  // Vincular transferencias
  const pairs = new Map<string, string[]>();
  for (const t of txs) if (t.pair) pairs.set(t.pair, [...(pairs.get(t.pair) ?? []), idByIndex.get(t)!]);
  for (const [a, b] of pairs.values()) {
    if (!a || !b) continue;
    await db.transaction.update({ where: { id: a }, data: { transferPeerId: b } });
    await db.transaction.update({ where: { id: b }, data: { transferPeerId: a } });
  }

  // Inversiones (ficticias)
  const fund = await db.investment.create({
    data: { userId, name: "Fondo Índice Global (demo)", assetType: "INDEX_FUND", isin: "IE00B03HCZ61", platform: "Broker Demo", accountId: broker },
  });
  for (const t of txs) {
    if (!t.buy) continue;
    const units = (30000 / 100 / Number(t.buy.price)).toFixed(6);
    await db.investmentTransaction.create({
      data: { investmentId: fund.id, type: "BUY", date: t.date, amount: 30000, units, price: t.buy.price, cashTransactionId: idByIndex.get(t)! },
    });
  }
  for (const [month, value] of navByMonth) {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const end = utcDate(y, m + 1, 0);
    if (end <= LAST_DAY) {
      const drift = Math.round(value * (1 + (rand() * 0.02 - 0.005)) * 100) / 100;
      await db.investmentPrice.create({ data: { investmentId: fund.id, date: end, price: drift.toFixed(2) } });
    }
  }
  const plan = await db.investment.create({
    data: { userId, name: "Plan de Pensiones (demo)", assetType: "PENSION_PLAN", platform: "Aseguradora Demo", valuationMode: "TOTAL_VALUE" },
  });
  await db.investmentTransaction.create({ data: { investmentId: plan.id, type: "BUY", date: utcDate(2025, 12, 20), amount: 150000 } });
  await db.investmentPrice.create({ data: { investmentId: plan.id, date: utcDate(2026, 6, 30), totalValue: 158400 } });
  await db.investmentPrice.create({ data: { investmentId: plan.id, date: utcDate(2026, 9, 1), totalValue: 161230 } });
  const etf = await db.investment.create({
    data: { userId, name: "ETF Emergentes (demo)", assetType: "ETF", ticker: "EMDEMO", platform: "Broker Demo", accountId: broker },
  });
  await db.investmentTransaction.create({ data: { investmentId: etf.id, type: "BUY", date: utcDate(2026, 2, 10), amount: 100000, units: "40", price: "25", fees: 200 } });
  await db.investmentPrice.create({ data: { investmentId: etf.id, date: utcDate(2026, 6, 30), price: "26.40" } }); // desactualizado a propósito

  // Saldos del banco: el de julio cuadra; el de agosto tiene +150 € de descuadre a propósito.
  const balanceAt = async (accountId: string, at: Date, opening: number) => {
    const agg = await db.transaction.aggregate({ where: { accountId, date: { gt: OPENING, lte: at } }, _sum: { amount: true } });
    return opening + (agg._sum.amount ?? 0);
  };
  await db.accountBalance.create({
    data: { accountId: principal, date: utcDate(2026, 7, 31), balance: await balanceAt(principal, utcDate(2026, 7, 31), 320000), source: "MANUAL", notes: "Demo: cuadra" },
  });
  await db.accountBalance.create({
    data: { accountId: principal, date: utcDate(2026, 8, 31), balance: (await balanceAt(principal, utcDate(2026, 8, 31), 320000)) + 15000, source: "MANUAL", notes: "Demo: descuadre intencionado de 150 €" },
  });
  // Valoraciones del coche (otros activos)
  for (const [mm, v] of [[5, 1170000], [8, 1140000]] as const) {
    await db.accountBalance.create({ data: { accountId: coche, date: utcDate(2026, mm, 31), balance: v, source: "MANUAL" } });
  }

  // Deuda
  const loan = await db.liability.create({
    data: { userId, name: "Financiación móvil", type: "FINANCING", lender: "Tienda Demo", originalAmount: 36000, monthlyPayment: 3000, paymentAccountId: principal, startDate: utcDate(2026, 1, 12) },
  });
  for (let i = 0; i < 7; i++) {
    const [y, m] = addMonths("2026-03", i).split("-").map(Number) as [number, number];
    await db.liabilityBalance.create({ data: { liabilityId: loan.id, date: utcDate(y, m, 12), balance: 36000 - 3000 * (i + 2) } });
  }

  await db.appSetting.create({
    data: { userId, key: "onboarding", value: JSON.stringify({ confirmed: ["balances"], skipped: ["investments", "import", "categories"], finished: true }) },
  });

  console.log(`[demo] ${txs.length} movimientos ficticios en 6 cuentas, ${pairs.size} transferencias internas vinculadas.`);
}
