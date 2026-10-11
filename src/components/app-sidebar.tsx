"use client";

import { BookOpen, FileText, LayoutDashboard, Receipt, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AppSidebar({ defaultYear, years }: { defaultYear: number; years: number[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const declMatch = /^\/declaracion\/(\d{4})/.exec(pathname);
  const year = declMatch ? Number(declMatch[1]) : Number(search.get("year")) || defaultYear;

  const withYear = (href: string) => `${href}${href.includes("?") ? "&" : "?"}year=${year}`;
  const items = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, url: withYear("/"), active: pathname === "/" },
    { href: "/movimientos", label: "Movimientos", icon: Receipt, url: withYear("/movimientos"), active: pathname.startsWith("/movimientos") },
    { href: "/declaracion", label: "Declaración", icon: FileText, url: `/declaracion/${year}`, active: pathname.startsWith("/declaracion") },
    { href: "/configuracion", label: "Configuración", icon: Settings, url: "/configuracion", active: pathname.startsWith("/configuracion") },
    { href: "/guia", label: "Guía", icon: BookOpen, url: "/guia", active: pathname.startsWith("/guia") },
  ];

  function changeYear(next: number) {
    if (declMatch) return router.push(`/declaracion/${next}`);
    const params = new URLSearchParams(search.toString());
    params.set("year", String(next));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Sidebar>
      <SidebarHeader className="gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-semibold">IRNR</p>
            <p className="text-xs text-muted-foreground">Modelo 210 · no residente UE</p>
          </div>
          <ThemeToggle />
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Ejercicio
          <select
            aria-label="Ejercicio"
            value={year}
            onChange={(e) => changeYear(Number(e.target.value))}
            className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => (
                <SidebarMenuItem key={it.href}>
                  <SidebarMenuButton isActive={it.active} render={<Link href={it.url} />}>
                    <it.icon />
                    <span>{it.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
