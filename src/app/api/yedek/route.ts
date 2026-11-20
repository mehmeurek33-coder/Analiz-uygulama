import { NextResponse } from "next/server";
import { oturumKullanicisi } from "@/lib/supabase/server";
import { indirmeBaglantisi, yedekAl } from "@/lib/yedek";

export const maxDuration = 60;

/**
 * GET: Vercel cron (3 günde bir). Vercel, CRON_SECRET tanımlıysa onu Bearer olarak gönderir.
 * POST: uygulamadan "Şimdi yedekle" (oturum gerekli).
 */
export async function GET(request: Request) {
  const gizli = process.env.CRON_SECRET;
  if (!gizli || request.headers.get("authorization") !== `Bearer ${gizli}`) {
    return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  }
  try {
    return NextResponse.json(await yedekAl());
  } catch (e) {
    return NextResponse.json({ hata: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await oturumKullanicisi();
  if (!user) return NextResponse.json({ hata: "Oturum yok." }, { status: 401 });
  const govde = await request.json().catch(() => ({}));
  try {
    // İndirme bağlantısı iste: { indir: "<klasör>/<dosya>" }
    if (typeof govde.indir === "string") {
      if (!/^[\w-]+\/[\w.]+$/.test(govde.indir)) {
        return NextResponse.json({ hata: "Geçersiz dosya." }, { status: 400 });
      }
      return NextResponse.json({ url: await indirmeBaglantisi(govde.indir) });
    }
    return NextResponse.json(await yedekAl());
  } catch (e) {
    return NextResponse.json({ hata: (e as Error).message }, { status: 500 });
  }
}
