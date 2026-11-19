import { NextResponse } from "next/server";
import { hesapVarMi, yoneticiIstemcisi } from "@/lib/supabase/admin";

/**
 * İLK KURULUM: Uygulama tek kişiliktir. Bu uç yalnızca henüz hiç hesap yokken
 * çalışır; ilk hesap oluşturulduktan sonra kalıcı olarak 403 döner.
 *
 * İsteğe bağlı SAHIP_EPOSTA tanımlıysa, ilk hesap yalnızca o adresle açılabilir
 * (yayına aldıktan sonra hesabını açana kadar başkasının araya girmesini önler).
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

  if (await hesapVarMi()) {
    return NextResponse.json(
      { hata: "Bu uygulama tek kişilik ve hesap zaten oluşturulmuş. Giriş yap." },
      { status: 403 },
    );
  }

  if (!eposta.includes("@")) {
    return NextResponse.json({ hata: "Geçerli bir e-posta gir." }, { status: 400 });
  }
  if (sifre.length < 8) {
    return NextResponse.json({ hata: "Şifre en az 8 karakter olmalı." }, { status: 400 });
  }

  const sahip = (process.env.SAHIP_EPOSTA || "").trim().toLowerCase();
  if (sahip && eposta !== sahip) {
    return NextResponse.json(
      { hata: "Bu uygulamanın hesabı yalnızca sahibinin e-postasıyla açılabilir." },
      { status: 403 },
    );
  }

  const { error } = await yoneticiIstemcisi().auth.admin.createUser({
    email: eposta,
    password: sifre,
    email_confirm: true,
    user_metadata: { ad: ad || eposta.split("@")[0] },
  });

  if (error) return NextResponse.json({ hata: error.message }, { status: 500 });
  return NextResponse.json({ tamam: true });
}
