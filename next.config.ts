import type { NextConfig } from "next";

// Görseller tarayıcıya aynı alan adından verilir (/b2/file/<depo>/<yol>?Authorization=...): operatör B2'nin
// indirme adresini engelleyebiliyor (HATALAR.md E8). Kullanıcının adresinde (Cloudflare Worker) /b2/* doğrudan
// B2'ye gider; vercel.app'ten açılınca bu rewrite iletir.
const B2_INDIRME = process.env.B2_INDIRME_ADRESI ?? "https://f003.backblazeb2.com";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  async rewrites() {
    return [{ source: "/b2/:yol*", destination: `${B2_INDIRME}/:yol*` }];
  },
};

export default nextConfig;
