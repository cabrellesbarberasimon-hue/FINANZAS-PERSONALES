"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { NavLinks } from "./Sidebar";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-4">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Finanzas personales
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-mr-2 rounded-lg p-2 text-muted hover:bg-canvas"
          aria-label="Abrir menú"
        >
          <Menu className="size-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-ink/30"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-surface p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="px-3 text-sm font-semibold text-muted">Menú</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-muted hover:bg-canvas"
                aria-label="Cerrar menú"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
