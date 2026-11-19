/**
 * Sunucu tarafı özellik bayrakları. Yalnızca server component / route handler içinde kullan.
 *
 * Uygulamadan PDF yükleme (Anthropic API ile otomatik ayrıştırma) isteğe bağlıdır.
 * ANTHROPIC_API_KEY tanımlı değilse yükleme ekranı gizlenir; sorular Claude Code
 * oturumunda ayrıştırılıp scripts/soru-ekle.ts ile veritabanına eklenir (bkz. CLAUDE.md).
 */
export function pdfYuklemeAcik(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}
