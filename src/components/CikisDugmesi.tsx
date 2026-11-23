"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { tarayiciIstemcisi } from "@/lib/supabase/client";
import { kuyruguBosalt, yerelVeriyiSil } from "@/lib/cevrimdisi";

export default function CikisDugmesi() {
  const router = useRouter();
  const [bekle, setBekle] = useState(false);

  return (
    <button
      type="button"
      className="rounded-lg px-3 py-2 text-sm text-silik hover:bg-kart hover:text-metin"
      disabled={bekle}
      onClick={async () => {
        setBekle(true);
        await kuyruguBosalt();
        await yerelVeriyiSil();
        await tarayiciIstemcisi().auth.signOut();
        router.push("/giris");
        router.refresh();
      }}
    >
      Çıkış
    </button>
  );
}
