import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { oturumKullanicisi } from "@/lib/supabase/server";
import CikisDugmesi from "@/components/CikisDugmesi";
import { pdfYuklemeAcik } from "@/lib/ozellikler";

export const metadata: Metadata = {
  title: "Soru Analiz",
  description: "Soru PDF'lerini çöz, hangi dersin hangi konusunda eksiğin olduğunu gör.",
  manifest: "/manifest.webmanifest",
  applicationName: "Soru Analiz",
  appleWebApp: { capable: true, title: "Soru Analiz", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1120",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await oturumKullanicisi();
  const yuklemeAcik = pdfYuklemeAcik();

  return (
    <html lang="tr">
      <body className="min-h-dvh">
        {user && (
          <header className="sticky top-0 z-20 border-b border-cizgi bg-zemin/90 backdrop-blur">
            <nav className="mx-auto flex max-w-5xl items-center gap-1 px-3 py-2.5 sm:gap-2 sm:px-5">
              <Link href="/" className="mr-auto flex items-center gap-2 font-bold">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-vurgu/15 text-vurgu">
                  SA
                </span>
                <span className="hidden sm:inline">Soru Analiz</span>
              </Link>
              {yuklemeAcik && (
                <Link href="/yukle" className="rounded-lg px-3 py-2 text-sm hover:bg-kart">
                  PDF Yükle
                </Link>
              )}
              <Link href="/analiz" className="rounded-lg px-3 py-2 text-sm hover:bg-kart">
                Analiz
              </Link>
              <CikisDugmesi />
            </nav>
          </header>
        )}
        <main className="mx-auto max-w-5xl px-3 py-5 sm:px-5 sm:py-8">{children}</main>
      </body>
    </html>
  );
}
