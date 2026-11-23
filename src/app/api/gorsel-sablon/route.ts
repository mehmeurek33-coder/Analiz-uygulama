import { NextResponse } from "next/server";
import { gorselSablonu } from "@/lib/aciklamaGorsel";
import { oturumKullanicisi } from "@/lib/supabase/server";

/** GET /api/gorsel-sablon → {onek, ek}: tarayıcı görsel bağlantılarını kendisi kurar (küçük yanıt, 1 saat önbellek). */
export async function GET() {
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });
  return NextResponse.json({ sablon: await gorselSablonu() }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
