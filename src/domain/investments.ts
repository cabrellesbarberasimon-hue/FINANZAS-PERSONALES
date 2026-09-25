import Decimal from "decimal.js";
import { addMonths, daysBetween, monthKey, monthRange } from "./dates";
import { percentage, roundHalfAwayFromZero, type Cents } from "./money";

/**
 * Cálculo de inversiones (docs/ARQUITECTURA.md §8). Puro y determinista.
 *
 * Principio (§15): APORTACIONES y RENTABILIDAD se separan siempre.
 *   capital aportado = lo que has puesto (compras + sus comisiones + comisiones sueltas)
 *   retirado         = lo que has sacado (ventas netas de comisiones + dividendos)
 *   ganancia total   = valor actual + retirado − capital aportado
 * Una aportación nueva sube a la vez el valor y el capital aportado: la
 * ganancia no cambia.
 *
 * Participaciones y precios con Decimal (exactos); importes en céntimos.
 */

export type InvestmentTxType = "BUY" | "SELL" | "DIVIDEND" | "FEE";
export type ValuationMode = "UNITS" | "TOTAL_VALUE";

export interface InvTx {
  id: string;
  date: Date;
  type: InvestmentTxType;
  /** Participaciones (texto o Decimal para no perder precisión). */
  units: string | null;
  price: string | null;
  /** Céntimos, positivo. BUY: invertido sin comisiones. SELL: bruto recibido. */
  amount: Cents;
  fees: Cents;
}

export interface InvPrice {
  date: Date;
  price: string | null;
  totalValue: Cents | null;
}

export const STALE_PRICE_DAYS = 35;

export interface Position {
  asOf: Date;
  units: Decimal;
  /** Coste de las participaciones vivas (método de coste medio ponderado). */
  costBasis: Cents;
  /** Precio medio de compra por participación (null si no hay participaciones). */
  averagePrice: Decimal | null;
  contributed: Cents;
  withdrawn: Cents;
  feesPaid: Cents;
  realizedGain: Cents;
  /** Valor de mercado; null = sin valoración ("Pendiente de datos"). */
  value: Cents | null;
  valuation: { date: Date; price: Decimal | null; source: "PRICE" | "TRANSACTION" | "TOTAL_VALUE" } | null;
  stale: boolean;
  /** valor − coste de lo vivo (solo modo participaciones). */
  unrealizedGain: Cents | null;
  /** valor + retirado − aportado. */
  totalGain: Cents | null;
  /** ganancia total / aportado × 100. */
  simpleReturn: number | null;
  firstDate: Date | null;
  transactionIds: string[];
}

export class InvestmentDataError extends Error {}

function dec(v: string | null | undefined): Decimal | null {
  if (v === null || v === undefined || v === "") return null;
  return new Decimal(v);
}

/** Valor en céntimos de `units × price`, redondeado al céntimo. */
export function marketValue(units: Decimal, price: Decimal): Cents {
  return roundHalfAwayFromZero(units.mul(price).mul(100).toNumber());
}

export function computePosition(
  txs: InvTx[],
  prices: InvPrice[],
  mode: ValuationMode,
  asOf: Date,
): Position {
  const list = txs
    .filter((t) => t.date.getTime() <= asOf.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime() || (a.type === "SELL" ? 1 : 0) - (b.type === "SELL" ? 1 : 0));

  let units = new Decimal(0);
  let costBasis = 0;
  let contributed = 0;
  let withdrawn = 0;
  let feesPaid = 0;
  let realizedGain = 0;
  let lastTxPrice: { date: Date; price: Decimal } | null = null;

  for (const t of list) {
    const u = dec(t.units);
    const p = dec(t.price);
    switch (t.type) {
      case "BUY":
        contributed += t.amount + t.fees;
        feesPaid += t.fees;
        costBasis += t.amount + t.fees;
        if (u) units = units.plus(u);
        break;
      case "SELL": {
        withdrawn += t.amount - t.fees;
        feesPaid += t.fees;
        if (mode === "UNITS") {
          if (!u) throw new InvestmentDataError("Venta sin participaciones.");
          if (u.gt(units)) throw new InvestmentDataError(`Venta de ${u.toString()} participaciones con solo ${units.toString()} en cartera.`);
          const costOfSold = roundHalfAwayFromZero(new Decimal(costBasis).mul(u).div(units).toNumber());
          realizedGain += t.amount - t.fees - costOfSold;
          costBasis -= costOfSold;
          units = units.minus(u);
        } else {
          // Sin participaciones: el reembolso reduce el coste de forma proporcional no calculable;
          // se descuenta del coste hasta agotarlo.
          const reduce = Math.min(costBasis, t.amount - t.fees);
          costBasis -= reduce;
          realizedGain += t.amount - t.fees - reduce;
        }
        break;
      }
      case "DIVIDEND":
        withdrawn += t.amount - t.fees;
        feesPaid += t.fees;
        realizedGain += t.amount - t.fees;
        break;
      case "FEE":
        contributed += t.amount;
        feesPaid += t.amount;
        realizedGain -= t.amount;
        break;
    }
    if (p && (t.type === "BUY" || t.type === "SELL")) lastTxPrice = { date: t.date, price: p };
  }

  // Valoración: último dato en o antes de la fecha.
  let valuation: Position["valuation"] = null;
  let value: Cents | null = null;
  const eligible = prices.filter((p) => p.date.getTime() <= asOf.getTime()).sort((a, b) => b.date.getTime() - a.date.getTime());
  if (mode === "UNITS") {
    const lastPrice = eligible.find((p) => p.price !== null);
    // El precio de una compra/venta también es un dato real de mercado en esa fecha.
    if (lastPrice && (!lastTxPrice || lastPrice.date >= lastTxPrice.date)) {
      valuation = { date: lastPrice.date, price: new Decimal(lastPrice.price!), source: "PRICE" };
    } else if (lastTxPrice) {
      valuation = { date: lastTxPrice.date, price: lastTxPrice.price, source: "TRANSACTION" };
    }
    if (units.isZero() && list.length > 0) value = 0;
    else if (valuation?.price) value = marketValue(units, valuation.price);
  } else {
    const last = eligible.find((p) => p.totalValue !== null);
    if (last) {
      valuation = { date: last.date, price: null, source: "TOTAL_VALUE" };
      value = last.totalValue;
    } else if (list.length > 0 && costBasis === 0) {
      value = 0;
    }
  }

  const stale = valuation !== null && value !== 0 && daysBetween(valuation.date, asOf) > STALE_PRICE_DAYS;
  const totalGain = value === null ? null : value + withdrawn - contributed;
  return {
    asOf,
    units,
    costBasis,
    averagePrice: mode === "UNITS" && units.gt(0) ? new Decimal(costBasis).div(100).div(units) : null,
    contributed,
    withdrawn,
    feesPaid,
    realizedGain,
    value,
    valuation,
    stale,
    unrealizedGain: value === null ? null : value - costBasis,
    totalGain,
    simpleReturn: totalGain === null || contributed === 0 ? null : percentage(totalGain, contributed),
    firstDate: list[0]?.date ?? null,
    transactionIds: list.map((t) => t.id),
  };
}

// -----------------------------------------------------------------------------
// Rentabilidad ponderada por aportaciones (TIR / XIRR)
// -----------------------------------------------------------------------------

export interface CashFlow {
  date: Date;
  /** Desde el punto de vista del inversor: aportación negativa, cobro positivo. */
  amount: number;
}

/** Flujos para la TIR: aportaciones (−), retiradas (+) y el valor final (+). */
export function investmentCashFlows(txs: InvTx[], position: Position): CashFlow[] | null {
  if (position.value === null) return null;
  const flows: CashFlow[] = [];
  for (const t of txs) {
    if (t.date.getTime() > position.asOf.getTime()) continue;
    if (t.type === "BUY") flows.push({ date: t.date, amount: -(t.amount + t.fees) });
    if (t.type === "FEE") flows.push({ date: t.date, amount: -t.amount });
    if (t.type === "SELL" || t.type === "DIVIDEND") flows.push({ date: t.date, amount: t.amount - t.fees });
  }
  if (position.value > 0) flows.push({ date: position.asOf, amount: position.value });
  return flows;
}

function npv(rate: number, flows: CashFlow[], t0: number): number {
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, (f.date.getTime() - t0) / (365 * 86_400_000)), 0);
}

/**
 * TIR anual (XIRR). Newton-Raphson con respaldo de bisección.
 * Devuelve null si no hay flujos de ambos signos o no converge ("no calculable").
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const t0 = Math.min(...flows.map((f) => f.date.getTime()));
  const span = Math.max(...flows.map((f) => f.date.getTime())) - t0;
  if (span <= 0) return null;

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate, flows, t0);
    const h = 1e-6;
    const d = (npv(rate + h, flows, t0) - f) / h;
    if (!Number.isFinite(d) || d === 0) break;
    const next = rate - f / d;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - rate) < 1e-10) return next;
    rate = next;
  }
  // Bisección en [-0.9999, 100]
  let lo = -0.9999;
  let hi = 100;
  let flo = npv(lo, flows, t0);
  const fhi = npv(hi, flows, t0);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid, flows, t0);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-12) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

// -----------------------------------------------------------------------------
// Series e histórico
// -----------------------------------------------------------------------------

export interface MonthPoint {
  month: string;
  /** Valor a fin de mes (o a `asOf` en el mes en curso); null si no hay valoración. */
  value: Cents | null;
  contributedCumulative: Cents;
  /** Aportado neto EN el mes (compras + comisiones − ventas − dividendos). */
  netContribution: Cents;
}

export function monthlySeries(
  txs: InvTx[],
  prices: InvPrice[],
  mode: ValuationMode,
  asOf: Date,
): MonthPoint[] {
  const first = txs.reduce<Date | null>((m, t) => (!m || t.date < m ? t.date : m), null);
  if (!first) return [];
  const points: MonthPoint[] = [];
  const last = monthKey(asOf);
  for (let m = monthKey(first); m <= last; m = addMonths(m, 1)) {
    const { start, end } = monthRange(m);
    const at = m === last ? asOf : new Date(end.getTime() - 86_400_000);
    const pos = computePosition(txs, prices, mode, at);
    const inMonth = txs.filter((t) => t.date >= start && t.date < end && t.date <= asOf);
    const net = inMonth.reduce((s, t) => {
      if (t.type === "BUY") return s + t.amount + t.fees;
      if (t.type === "FEE") return s + t.amount;
      return s - (t.amount - t.fees);
    }, 0);
    points.push({ month: m, value: pos.value, contributedCumulative: pos.contributed, netContribution: net });
  }
  return points;
}

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

/** ISIN: 2 letras de país + 9 alfanuméricos + dígito de control (Luhn sobre la conversión). */
export function isValidIsin(isin: string): boolean {
  const s = isin.trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s)) return false;
  const digits = s
    .split("")
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join("");
  let sum = 0;
  let double = true; // se empieza a doblar desde el penúltimo dígito
  for (let i = digits.length - 2; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/**
 * Completa una compra/venta a partir de dos de los tres datos
 * (importe, participaciones, precio). Si vienen los tres, comprueba que cuadran.
 */
export function completeTrade(input: { amount: Cents; units?: string | null; price?: string | null }): {
  units: string;
  price: string;
} {
  const amount = new Decimal(input.amount).div(100);
  const u = dec(input.units);
  const p = dec(input.price);
  if (u && u.lte(0)) throw new InvestmentDataError("Las participaciones deben ser positivas.");
  if (p && p.lte(0)) throw new InvestmentDataError("El precio debe ser positivo.");
  if (u && p) {
    const implied = u.mul(p);
    const tolerance = Decimal.max(new Decimal("0.02"), amount.mul("0.005"));
    if (implied.minus(amount).abs().gt(tolerance)) {
      throw new InvestmentDataError(
        `Participaciones × precio = ${implied.toFixed(2)} € no cuadra con el importe ${amount.toFixed(2)} €.`,
      );
    }
    return { units: u.toString(), price: p.toString() };
  }
  if (u) return { units: u.toString(), price: amount.div(u).toDecimalPlaces(6).toString() };
  if (p) return { units: amount.div(p).toDecimalPlaces(6).toString(), price: p.toString() };
  throw new InvestmentDataError("Indica las participaciones o el precio (valor liquidativo) de la operación.");
}
