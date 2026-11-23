import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/yedek: Vercel cron oturumsuz çağırır; rota kendisi CRON_SECRET ya da oturum ister
// /api/gorsel-yukle: aktarım araçları oturumsuz çağırır; rota YUKLEME_ANAHTARI ister
// /api/kaynak: aynı anahtarla kaynak PDF listesi/indirme bağlantısı
const ACIK_YOLLAR = ["/giris", "/api/kayit", "/api/yedek", "/api/gorsel-yukle", "/api/kaynak", "/api/b2-bakim", "/api/b2-yukleme-adresi", "/_next", "/favicon"];

export async function middleware(request: NextRequest) {
  const yol = request.nextUrl.pathname;
  const acik = ACIK_YOLLAR.some((p) => yol.startsWith(p));

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Oturum tazeleme (cookie yenilenir)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !acik) {
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    url.searchParams.set("devam", yol);
    return NextResponse.redirect(url);
  }

  if (user && yol === "/giris") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest|ico)$).*)"],
};
