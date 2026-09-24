import clsx from "clsx";
import { formatMoney } from "@/domain/money";

/**
 * Importe con color semántico: verde entrada, rojo salida (§31).
 * `neutral` desactiva el color (p.ej. saldos, transferencias internas).
 */
export function Money({
  cents,
  currency = "EUR",
  signed = false,
  neutral = false,
  decimals = 2,
  className,
}: {
  cents: number;
  currency?: string;
  signed?: boolean;
  neutral?: boolean;
  decimals?: 0 | 2;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "whitespace-nowrap tabular-nums",
        !neutral && cents > 0 && "text-positive",
        !neutral && cents < 0 && "text-negative",
        className,
      )}
    >
      {formatMoney(cents, { currency, signed, decimals })}
    </span>
  );
}
