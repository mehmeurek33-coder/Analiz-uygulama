import { createClient } from "@supabase/supabase-js";

/**
 * service_role anahtarıyla çalışan istemci. RLS'i geçer.
 * SADECE sunucu tarafında (route handler / server component) kullanılır.
 */
export function yoneticiIstemcisi() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY tanımlı değil.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Uygulama tek kişilik: ilk hesap açıldıktan sonra kayıt kapanır.
 * Hesap var mı? Hata durumunda güvenli tarafta kalıp "var" der (kayıt açılmaz).
 */
export async function hesapVarMi(): Promise<boolean> {
  try {
    const { data, error } = await yoneticiIstemcisi().auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return true;
    return data.users.length > 0;
  } catch {
    return true;
  }
}
