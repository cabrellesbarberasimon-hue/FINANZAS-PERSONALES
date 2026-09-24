import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 es un módulo nativo: no debe empaquetarse.
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  experimental: {
    // Subida de extractos: hasta 5 MB por fichero (límite validado también en el servidor).
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
