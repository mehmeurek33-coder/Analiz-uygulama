import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Sunucu bileseni / route handler icinde oturumlu istemci. */
export async function sunucuIstemcisi() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Sunucu bileseninden cagrildiginda yazilamaz; middleware yeniler.
          }
        },
      },
    },
  );
}

/** Oturumlu kullaniciyi dondurur, yoksa null. */
export async function oturumKullanicisi() {
  const supabase = await sunucuIstemcisi();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
