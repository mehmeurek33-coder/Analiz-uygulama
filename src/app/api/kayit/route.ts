import { NextResponse } from "next/server";
import { yoneticiIstemcisi } from "@/lib/supabase/admin";

/**
 * Kayit, e-posta dogrulamasi olmadan sunucu tarafinda yapilir.
 * Boylece kimse davetsiz kayit olamaz ve kimseye dogrulama maili gitmez.
 */
export async function POST(request: Request) {
  let eposta = "";
  let sifre = "";
  let ad = "";
  try {
    const body = await request.json();
    eposta = String(body.eposta || "").trim().toLowerCase();
    sifre = String(body.sifre || "");
    ad = String(body.ad || "").trim();
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }

  if (!eposta.includes("@")) {
    return NextResponse.json({ hata: "Geçerli bir e-posta girin." }, { status: 400 });
  }
  if (sifre.length < 8) {
    return NextResponse.json({ hata: "Şifre en az 8 karakter olmalı." }, { status: 400 });
  }

  const izinli = (process.env.IZINLI_EPOSTALAR || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (izinli.length > 0 && !izinli.includes(eposta)) {
    return NextResponse.json(
      { hata: "Bu e-posta ile kayıt yetkiniz yok. Uygulama sahibinden izin isteyin." },
      { status: 403 },
    );
  }

  const admin = yoneticiIstemcisi();
  const { error } = await admin.auth.admin.createUser({
    email: eposta,
    password: sifre,
    email_confirm: true,
    user_metadata: { ad: ad || eposta.split("@")[0] },
  });

  if (error) {
    const zaten = /already|registered|exists/i.test(error.message);
    return NextResponse.json(
      { hata: zaten ? "Bu e-posta ile zaten bir hesap var, giriş yapın." : error.message },
      { status: zaten ? 409 : 500 },
    );
  }

  return NextResponse.json({ tamam: true });
}
