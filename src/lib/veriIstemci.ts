"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ağır sayfa verisi (sorular, açıklamalar) tarayıcıya Vercel'den geçmeden gelir (HATALAR E10: Vercel Fast Origin
 * Transfer kotası). Kullanıcının adresinde (Cloudflare Worker) /sb/* doğrudan Supabase'e gider; vercel.app ya da
 * yerelde doğrudan Supabase adresi. Oturum çerezi aynı adla okunur (sunucu istemcisiyle ortak oturum).
 */
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const REF = new URL(SUPABASE).hostname.split(".")[0];

let istemci: SupabaseClient | null = null;

export function veriIstemcisi(): SupabaseClient {
  if (istemci) return istemci;
  const h = window.location.hostname;
  const dogrudan = h.endsWith("vercel.app") || h === "localhost" || h === "127.0.0.1";
  const url = dogrudan ? SUPABASE : `${window.location.origin}/sb`;
  istemci = createBrowserClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { name: `sb-${REF}-auth-token` },
  }) as unknown as SupabaseClient;
  return istemci;
}

let sablon: Promise<{ onek: string; ek: string } | null> | null = null;

/** Görsel bağlantı şablonu (Vercel'den küçük bir yanıt; sayfa ömrü boyunca önbellekte). */
export function gorselSablonuAl() {
  if (!sablon) {
    sablon = fetch("/api/gorsel-sablon", { credentials: "same-origin" })
      .then((c) => (c.ok ? c.json() : { sablon: null }))
      .then((v) => v.sablon ?? null)
      .catch(() => null);
  }
  return sablon;
}
