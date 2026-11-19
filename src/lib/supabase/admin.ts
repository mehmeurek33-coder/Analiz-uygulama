import { createClient } from "@supabase/supabase-js";

/**
 * service_role anahtariyla calisan istemci. RLS'i gecer.
 * SADECE sunucu tarafinda (route handler / server action) kullanilir.
 */
export function yoneticiIstemcisi() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY tanimli degil.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
