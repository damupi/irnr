import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getDb } from "@/db/client";
import { today } from "@/server/today";
import { defaultYear } from "@/server/year";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IRNR",
  description: "Contabilidad del inmueble y Modelo 210 del IRNR",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const now = today();
  const currentYear = Number(now.slice(0, 4));
  const years = Array.from({ length: currentYear + 1 - 2023 + 1 }, (_, i) => 2023 + i);
  return (
    <html lang="es" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <ThemeProvider>
          <TooltipProvider>
            <SidebarProvider>
              <Suspense>
                <AppSidebar defaultYear={defaultYear(getDb(), now)} years={years} />
              </Suspense>
              <SidebarInset>
                <main className="mx-auto w-full max-w-7xl p-6">{children}</main>
              </SidebarInset>
            </SidebarProvider>
          </TooltipProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
