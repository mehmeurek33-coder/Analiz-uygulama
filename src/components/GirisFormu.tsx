"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { tarayiciIstemcisi } from "@/lib/supabase/client";

/**
 * Tek kişilik uygulama:
 *  - kurulumGerekli = true  -> henüz hesap yok, tek seferlik hesap oluşturma formu
 *  - kurulumGerekli = false -> sadece giriş formu (kayıt seçeneği hiç görünmez)
 */
export default function GirisFormu({ kurulumGerekli }: { kurulumGerekli: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const devam = params.get("devam") || "/";

  const [ad, setAd] = useState("");
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [sifreTekrar, setSifreTekrar] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);
    setBilgi(null);

    if (kurulumGerekli && sifre !== sifreTekrar) {
      setHata("Şifreler aynı değil.");
      return;
    }

    setBekle(true);
    try {
      if (kurulumGerekli) {
        const cevap = await fetch("/api/kayit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ad, eposta, sifre }),
        });
        const veri = await cevap.json();
        if (!cevap.ok) throw new Error(veri.hata || "Hesap oluşturulamadı.");
        setBilgi("Hesabın oluşturuldu, giriş yapılıyor...");
      }

      const { error } = await tarayiciIstemcisi().auth.signInWithPassword({
        email: eposta,
        password: sifre,
      });
      if (error) throw new Error(cevirHata(error.message));

      router.push(devam);
      router.refresh();
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Bir şeyler ters gitti.");
    } finally {
      setBekle(false);
    }
  }

  return (
    <form onSubmit={gonder} className="kart space-y-4">
      {kurulumGerekli && (
        <div className="rounded-xl border border-vurgu/30 bg-vurgu/10 px-3 py-2.5 text-sm">
          <p className="font-semibold text-vurgu">Bu uygulama tek kişilik.</p>
          <p className="mt-0.5 text-silik">
            Şimdi oluşturacağın hesap uygulamanın tek hesabı olacak. Sonrasında kayıt kalıcı
            olarak kapanır, sadece sen giriş yapabilirsin.
          </p>
        </div>
      )}

      {kurulumGerekli && (
        <div>
          <label className="etiket" htmlFor="ad">
            Adın
          </label>
          <input
            id="ad"
            className="giris-alani"
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            placeholder="Adın"
            autoComplete="name"
          />
        </div>
      )}

      <div>
        <label className="etiket" htmlFor="eposta">
          E-posta
        </label>
        <input
          id="eposta"
          type="email"
          required
          className="giris-alani"
          value={eposta}
          onChange={(e) => setEposta(e.target.value)}
          placeholder="ornek@eposta.com"
          autoComplete="email"
        />
      </div>

      <div>
        <label className="etiket" htmlFor="sifre">
          Şifre
        </label>
        <input
          id="sifre"
          type="password"
          required
          minLength={8}
          className="giris-alani"
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          placeholder="En az 8 karakter"
          autoComplete={kurulumGerekli ? "new-password" : "current-password"}
        />
      </div>

      {kurulumGerekli && (
        <div>
          <label className="etiket" htmlFor="sifre2">
            Şifre (tekrar)
          </label>
          <input
            id="sifre2"
            type="password"
            required
            minLength={8}
            className="giris-alani"
            value={sifreTekrar}
            onChange={(e) => setSifreTekrar(e.target.value)}
            autoComplete="new-password"
          />
        </div>
      )}

      {hata && (
        <p className="rounded-xl border border-kotu/40 bg-kotu/10 px-3 py-2 text-sm text-kotu">
          {hata}
        </p>
      )}
      {bilgi && (
        <p className="rounded-xl border border-vurgu/40 bg-vurgu/10 px-3 py-2 text-sm text-vurgu">
          {bilgi}
        </p>
      )}

      <button type="submit" className="btn-ana w-full" disabled={bekle}>
        {bekle ? "Bekle..." : kurulumGerekli ? "Hesabımı oluştur" : "Giriş yap"}
      </button>
    </form>
  );
}

function cevirHata(mesaj: string) {
  if (/invalid login credentials/i.test(mesaj)) return "E-posta veya şifre hatalı.";
  return mesaj;
}
