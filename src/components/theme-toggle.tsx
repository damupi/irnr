"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};

/** Sol en oscuro (pulsa para ir a claro), luna en claro (pulsa para ir a oscuro). */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // El tema real solo se conoce en el cliente: evita el desajuste de hidratación.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
  return (
    <Button variant="outline" size="icon" aria-label={label} title={label} onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
