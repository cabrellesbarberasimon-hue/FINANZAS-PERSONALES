import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { DemoBanner } from "@/components/layout/DemoBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Finanzas personales", template: "%s · Finanzas personales" },
  description: "Control de finanzas personales local y privado.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Todas las páginas leen la base de datos local: nunca se prerenderizan en el build.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <DemoBanner />
        <div className="flex min-h-dvh">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileNav />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
