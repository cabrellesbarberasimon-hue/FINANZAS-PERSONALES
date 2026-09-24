/**
 * Reglas de categorización iniciales (origen SYSTEM). Coinciden por
 * "descripción contiene" sobre la descripción normalizada (MAYÚSCULAS, sin acentos).
 * El usuario puede desactivarlas o crear las suyas; las suyas tienen prioridad.
 */

export interface SeedRule {
  pattern: string;
  category: string;
  subcategory: string;
}

export const SEED_RULES: SeedRule[] = [
  // Alimentación
  ...["MERCADONA", "CARREFOUR", "LIDL", "ALDI", "DIA ", "EROSKI", "CONSUM", "ALCAMPO", "HIPERCOR"].map(
    (p) => ({ pattern: p, category: "Alimentación", subcategory: "Supermercado" }),
  ),
  ...["MCDONALDS", "BURGER KING", "TELEPIZZA", "DOMINOS", "KFC", "GLOVO", "JUST EAT", "UBER EATS"].map(
    (p) => ({ pattern: p, category: "Alimentación", subcategory: "Comida rápida" }),
  ),
  // Transporte
  ...["REPSOL", "CEPSA", "GALP", "SHELL", "BP ", "PETRONOR", "BALLENOIL", "PLENOIL"].map((p) => ({
    pattern: p, category: "Transporte", subcategory: "Combustible",
  })),
  ...["RENFE", "METRO ", "EMT ", "CABIFY", "UBER ", "BLABLACAR", "ALSA"].map((p) => ({
    pattern: p, category: "Transporte", subcategory: "Transporte público",
  })),
  // Ocio / suscripciones
  ...["NETFLIX", "SPOTIFY", "HBO", "MAX.COM", "DISNEY", "AMAZON PRIME", "PRIME VIDEO", "APPLE.COM/BILL", "YOUTUBE", "DAZN"].map(
    (p) => ({ pattern: p, category: "Ocio", subcategory: "Suscripciones" }),
  ),
  ...["RYANAIR", "VUELING", "IBERIA", "BOOKING", "AIRBNB"].map((p) => ({
    pattern: p, category: "Ocio", subcategory: "Viajes",
  })),
  // Salud
  { pattern: "FARMACIA", category: "Salud", subcategory: "Farmacia" },
  // Vivienda
  ...["IBERDROLA", "ENDESA", "NATURGY", "HOLALUZ", "TOTALENERGIES"].map((p) => ({
    pattern: p, category: "Vivienda", subcategory: "Luz",
  })),
  ...["MOVISTAR", "VODAFONE", "ORANGE", "DIGI ", "MASMOVIL", "PEPEPHONE", "O2 "].map((p) => ({
    pattern: p, category: "Vivienda", subcategory: "Internet",
  })),
  // Compras
  ...["ZARA", "PRIMARK", "H&M", "MANGO"].map((p) => ({
    pattern: p, category: "Compras", subcategory: "Ropa",
  })),
  { pattern: "DECATHLON", category: "Deporte", subcategory: "Material deportivo" },
  ...["MEDIAMARKT", "PCCOMPONENTES", "FNAC"].map((p) => ({
    pattern: p, category: "Compras", subcategory: "Tecnología",
  })),
  ...["IKEA", "LEROY MERLIN", "BRICOMART"].map((p) => ({
    pattern: p, category: "Compras", subcategory: "Hogar",
  })),
  // Ingresos
  { pattern: "NOMINA", category: "Ingresos", subcategory: "Nómina" },
  { pattern: "LIQUIDACION INTERESES", category: "Ingresos", subcategory: "Intereses" },
  // Finanzas
  { pattern: "COMISION", category: "Finanzas", subcategory: "Comisiones" },
  { pattern: "AEAT", category: "Finanzas", subcategory: "Impuestos" },
];
