import {
  ArrowLeftRight,
  BarChart3,
  CheckCircle2,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Target,
  TrendingUp,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Fase del plan en la que la página pasa a ser funcional. */
  phase: number;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, phase: 5 },
  { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight, phase: 2 },
  { href: "/cuentas", label: "Cuentas", icon: Wallet, phase: 2 },
  { href: "/inversiones", label: "Inversiones", icon: TrendingUp, phase: 6 },
  { href: "/patrimonio", label: "Patrimonio", icon: Landmark, phase: 7 },
  { href: "/presupuestos", label: "Presupuestos", icon: PiggyBank, phase: 8 },
  { href: "/analisis", label: "Análisis", icon: BarChart3, phase: 9 },
  { href: "/objetivos", label: "Objetivos", icon: Target, phase: 8 },
  { href: "/importar", label: "Importar", icon: Upload, phase: 3 },
  { href: "/revision", label: "Revisión", icon: CheckCircle2, phase: 10 },
  { href: "/configuracion", label: "Configuración", icon: Settings, phase: 4 },
];
