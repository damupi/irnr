"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Tema por defecto = el del sistema; la elección manual se guarda en localStorage. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
