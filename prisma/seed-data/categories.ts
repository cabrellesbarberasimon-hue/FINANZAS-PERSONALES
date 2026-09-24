/**
 * Categorías iniciales. Para añadir categorías por defecto a instalaciones
 * NUEVAS, edita esta lista. Las categorías de un usuario existente se
 * gestionan desde Configuración > Categorías (el seed nunca borra ni renombra).
 */

export type SeedCategoryKind = "EXPENSE" | "INCOME" | "TRANSFER" | "INVESTMENT";

export interface SeedCategory {
  name: string;
  kind: SeedCategoryKind;
  icon: string;
  color: string;
  isSystem?: boolean;
  subcategories: Array<string | { name: string; extraordinary: boolean }>;
}

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: "Vivienda", kind: "EXPENSE", icon: "home", color: "#6366f1",
    subcategories: ["Alquiler/hipoteca", "Luz", "Agua", "Internet", "Seguros", "Mantenimiento"],
  },
  {
    name: "Alimentación", kind: "EXPENSE", icon: "shopping-cart", color: "#22c55e",
    subcategories: ["Supermercado", "Restaurantes", "Comida rápida"],
  },
  {
    name: "Transporte", kind: "EXPENSE", icon: "car", color: "#0ea5e9",
    subcategories: ["Combustible", "Transporte público", "Parking", "Mantenimiento vehículo", "Seguro vehículo"],
  },
  {
    name: "Salud", kind: "EXPENSE", icon: "heart-pulse", color: "#ef4444",
    subcategories: ["Farmacia", "Médico", "Fisioterapia"],
  },
  {
    name: "Deporte", kind: "EXPENSE", icon: "bike", color: "#f97316",
    subcategories: ["Gimnasio", "Ciclismo", "Running", "Natación", "Material deportivo"],
  },
  {
    name: "Ocio", kind: "EXPENSE", icon: "ticket", color: "#a855f7",
    subcategories: ["Viajes", "Suscripciones", "Entretenimiento"],
  },
  {
    name: "Compras", kind: "EXPENSE", icon: "shopping-bag", color: "#ec4899",
    subcategories: ["Ropa", "Tecnología", "Hogar"],
  },
  {
    name: "Finanzas", kind: "EXPENSE", icon: "landmark", color: "#64748b",
    subcategories: ["Comisiones", "Intereses", "Impuestos"],
  },
  {
    name: "Inversiones", kind: "INVESTMENT", icon: "trending-up", color: "#14b8a6", isSystem: true,
    subcategories: ["Aportación fondo", "Aportación broker", "Compra activo", "Retirada/reembolso"],
  },
  {
    name: "Transferencias", kind: "TRANSFER", icon: "arrow-left-right", color: "#94a3b8", isSystem: true,
    subcategories: ["Transferencia entre cuentas propias"],
  },
  {
    name: "Ingresos", kind: "INCOME", icon: "wallet", color: "#16a34a", isSystem: true,
    subcategories: [
      "Nómina",
      "Intereses",
      { name: "Devolución", extraordinary: true },
      { name: "Otros ingresos", extraordinary: true },
    ],
  },
];
