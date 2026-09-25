import type { Db } from "./common";

/**
 * Asistente de primera ejecución (§35). El estado "hecho" se deriva de los
 * datos cuando es posible; "saltado"/"confirmado" se guarda en AppSetting.
 */

export type OnboardingStepKey = "accounts" | "balances" | "investments" | "import" | "categories";
export type StepStatus = "done" | "skipped" | "pending";

export interface OnboardingStep {
  key: OnboardingStepKey;
  title: string;
  description: string;
  href: string;
  status: StepStatus;
  /** La funcionalidad aún no existe en esta fase: solo se puede saltar. */
  availableInPhase?: number;
}

const SETTING_KEY = "onboarding";

interface StoredState {
  confirmed: OnboardingStepKey[];
  skipped: OnboardingStepKey[];
  finished: boolean;
}

async function readState(db: Db, userId: string): Promise<StoredState> {
  const s = await db.appSetting.findUnique({ where: { userId_key: { userId, key: SETTING_KEY } } });
  const empty: StoredState = { confirmed: [], skipped: [], finished: false };
  if (!s) return empty;
  try {
    return { ...empty, ...(JSON.parse(s.value) as Partial<StoredState>) };
  } catch {
    return empty;
  }
}

async function writeState(db: Db, userId: string, state: StoredState) {
  const value = JSON.stringify(state);
  await db.appSetting.upsert({
    where: { userId_key: { userId, key: SETTING_KEY } },
    create: { userId, key: SETTING_KEY, value },
    update: { value },
  });
}

export async function getOnboarding(db: Db, userId: string) {
  const [state, accounts, investments, imports] = await Promise.all([
    readState(db, userId),
    db.account.count({ where: { userId } }),
    db.investment.count({ where: { userId } }),
    db.import.count({ where: { userId, status: "COMMITTED" } }),
  ]);
  const status = (key: OnboardingStepKey, derivedDone: boolean): StepStatus =>
    derivedDone || state.confirmed.includes(key) ? "done" : state.skipped.includes(key) ? "skipped" : "pending";

  const steps: OnboardingStep[] = [
    {
      key: "accounts",
      title: "Crear cuentas",
      description: "Cuentas corrientes, remuneradas, efectivo, tarjetas, broker…",
      href: "/cuentas/nueva",
      status: status("accounts", accounts > 0),
    },
    {
      key: "balances",
      title: "Introducir saldos iniciales",
      description: "Revisa que cada cuenta tiene su saldo y la fecha de ese saldo.",
      href: "/cuentas",
      status: status("balances", false),
    },
    {
      key: "investments",
      title: "Registrar inversiones existentes",
      description: "Fondos indexados, ETF, planes de pensiones…",
      href: "/inversiones/nueva",
      status: status("investments", investments > 0),
    },
    {
      key: "import",
      title: "Importar primer extracto",
      description: "Sube el CSV o Excel de tu banco.",
      href: "/importar",
      status: status("import", imports > 0),
    },
    {
      key: "categories",
      title: "Revisar categorías",
      description: "Ajusta categorías y reglas automáticas a tu gusto.",
      href: "/configuracion",
      status: status("categories", false),
    },
  ];
  const allResolved = steps.every((s) => s.status !== "pending");
  return { steps, finished: state.finished || allResolved, hasAccounts: accounts > 0 };
}

export async function markOnboardingStep(
  db: Db,
  userId: string,
  key: OnboardingStepKey,
  action: "confirm" | "skip" | "reset",
) {
  const state = await readState(db, userId);
  state.confirmed = state.confirmed.filter((k) => k !== key);
  state.skipped = state.skipped.filter((k) => k !== key);
  if (action === "confirm") state.confirmed.push(key);
  if (action === "skip") state.skipped.push(key);
  await writeState(db, userId, state);
}

export async function finishOnboarding(db: Db, userId: string, finished = true) {
  const state = await readState(db, userId);
  await writeState(db, userId, { ...state, finished });
}
