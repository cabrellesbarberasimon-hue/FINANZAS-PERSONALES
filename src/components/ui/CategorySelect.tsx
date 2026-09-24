import type { CategoryTree } from "@/server/services/categories";
import { inputClass } from "./styles";

const KIND_LABEL = { EXPENSE: "Gasto", INCOME: "Ingreso", TRANSFER: "Transferencia", INVESTMENT: "Inversión" } as const;

/** Selector único "Categoría / Subcategoría" con valor "catId|subId". */
export function CategorySelect({
  name,
  categories,
  defaultValue,
  emptyLabel = "Sin categoría",
  allowNoneFilter = false,
}: {
  name: string;
  categories: CategoryTree;
  defaultValue?: string;
  emptyLabel?: string;
  allowNoneFilter?: boolean;
}) {
  return (
    <select id={name} name={name} defaultValue={defaultValue ?? ""} className={inputClass}>
      <option value="">{emptyLabel}</option>
      {allowNoneFilter && <option value="none|">— Sin categoría —</option>}
      {categories.map((c) => (
        <optgroup key={c.id} label={`${c.name} · ${KIND_LABEL[c.kind]}`}>
          <option value={`${c.id}|`}>{c.name} (general)</option>
          {c.subcategories.map((s) => (
            <option key={s.id} value={`${c.id}|${s.id}`}>
              {c.name} / {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
