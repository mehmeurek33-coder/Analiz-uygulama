"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { tarayiciIstemcisi } from "@/lib/supabase/client";

export default function GirisFormu() {
  const router = useRouter();
  const params = useSearchParams();
  const devam = params.get("devam") || "/";

  const [kayitMi, setKayitMi] = useState(false);
  const [ad, setAd] = useState("");
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);
    setBilgi(null);
    setBekle(true);

    try {
      if (kayitMi) {
        const cevap = await fetch("/api/kayit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ad, eposta, sifre }),
        });
        const veri = await cevap.json();
        if (!cevap.ok) throw new Error(veri.hata || "Kayıt başarısız.");
        setBilgi("Hesap oluşturuldu, giris yapiliyor...");
      }

      const supabase = tarayiciIstemcisi();
      const { error } = await supabase.auth.signInWithPassword({ email: eposta, password: sifre });
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
      {kayitMi && (
        <div>
          <label className="etiket" htmlFor="ad">
            Adın
          </label>
          <input
            id="ad"
            className="giris-alani"
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            placeholder="Mehmet"
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
          autoComplete={kayitMi ? "new-password" : "current-password"}
        />
      </div>

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
        {bekle ? "Bekle..." : kayitMi ? "Hesap oluştur" : "Giriş yap"}
      </button>

      <button
        type="button"
        className="w-full text-center text-sm text-silik hover:text-metin"
        onClick={() => {
          setKayitMi(!kayitMi);
          setHata(null);
        }}
      >
        {kayitMi ? "Hesabım var, giriş yapacağım" : "Hesabım yok, kayıt olacağım"}
      </button>
    </form>
  );
}

function cevirHata(mesaj: string) {
  if (/invalid login credentials/i.test(mesaj)) return "E-posta veya şifre hatalı.";
  if (/email not confirmed/i.test(mesaj))
    return "E-posta doğrulanmamış. Supabase panelinde 'Confirm email' ayarını kapatın.";
  return mesaj;
}
