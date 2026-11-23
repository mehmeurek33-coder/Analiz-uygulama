"use client";

import { useEffect } from "react";
import { kuyruguBosalt } from "@/lib/cevrimdisi";
import { otoIndir } from "@/lib/gorselListesi";

/**
 * Servis çalışanını kaydeder (public/sw.js: görseller ve sayfalar tablette) ve internetsiz yapılmış
 * kayıtları bağlantı gelince gönderir; cihazda açıksa yeni görüntüleri arka planda indirir. Her sayfada çalışır.
 */
export default function CevrimdisiKayit() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.hostname !== "localhost") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const gonder = () => void kuyruguBosalt();
    gonder();
    window.addEventListener("online", gonder);
    // Bu cihazda açıksa: eksik/yeni görüntüleri arka planda indir (sayfa açılışını yavaşlatmasın diye gecikmeli)
    const t = setTimeout(() => void otoIndir(), 20000);
    return () => {
      window.removeEventListener("online", gonder);
      clearTimeout(t);
    };
  }, []);
  return null;
}
