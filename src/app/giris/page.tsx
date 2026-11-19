import GirisFormu from "@/components/GirisFormu";
import { hesapVarMi } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function GirisSayfasi() {
  const kurulumGerekli = !(await hesapVarMi());

  return (
    <div className="mx-auto mt-6 max-w-md sm:mt-16">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-vurgu/15 text-xl font-bold text-vurgu">
          SA
        </div>
        <h1 className="text-2xl font-bold">Soru Analiz</h1>
        <p className="ince mt-1">
          {kurulumGerekli
            ? "İlk kurulum: kendi hesabını oluştur."
            : "Soru PDF'lerini yükle, çöz, hangi konuda eksiğin olduğunu gör."}
        </p>
      </div>
      <GirisFormu kurulumGerekli={kurulumGerekli} />
    </div>
  );
}
