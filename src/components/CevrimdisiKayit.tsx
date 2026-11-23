"use client";

import { useEffect } from "react";
import { kuyruguBosalt } from "@/lib/cevrimdisi";

/**
 * Servis çalışanını kaydeder (public/sw.js: görseller ve sayfalar tablette) ve internetsiz yapılmış
 * kayıtları bağlantı gelince gönderir. Her sayfada çalışır.
 */
export default function CevrimdisiKayit() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.hostname !== "localhost") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const gonder = () => void kuyruguBosalt();
    gonder();
    window.addEventListener("online", gonder);
    return () => window.removeEventListener("online", gonder);
  }, []);
  return null;
}
