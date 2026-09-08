/**
 * Saklama süreleri — operatörün 8 Eylül 2026'da verdiği kararlar.
 *
 * NEDEN AYRI BİR MODÜL:
 * Bu iş veri siler. Silme kuralının nerede olduğu sorulduğunda cevabın
 * "routes.ts içinde bir setInterval" olmaması gerekir. Her kuralın yanında
 * kararı veren ve süreyi seçen gerekçe duruyor; süre değişecekse burada
 * değişir ve KVKK metni bu dosyayı kaynak alır.
 *
 * BURADA OLMAYANLAR — bilerek:
 *   - chat_messages / chat_sessions: süre KARARLAŞTIRILMADI. Ürünün ne
 *     olduğuna dair bir soru ve önce silme boşluğunun kapanmasını bekliyor
 *     (bkz. CLAUDE.md 8.2). Varsayılan bir süre uydurmak, kararı vermiş gibi
 *     görünüp vermemek olurdu.
 *   - confessions: satırlar hiçbir kullanıcıya bağlı değil (tabloda user
 *     sütunu yok), dolayısıyla kişi bazlı silinemez. Süre kararı ayrı.
 *   - user_bans: yasak kaydının hesap silinince yok olması yasak kaçırma
 *     yolu açar. Saklama burada meşru menfaat; ayrıca karara bağlanmalı.
 */

import { lt, sql } from "drizzle-orm";
import { db } from "./db";
import { emailLogs, users } from "@shared/schema";

/** email_logs: 90 gün. Teşhis değeri gerçek, süresiz tutmanın gerekçesi yok. */
const EMAIL_LOG_RETENTION_DAYS = 90;

/** Günde bir. Saatlik çalıştırmanın kazandıracağı bir şey yok. */
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Süresi dolmuş OTP'leri temizler.
 *
 * Kod zaten hash'li ve otpExpiry ile süreli; bu iş süresi geçmiş satırların
 * hash'ini de kaldırır. Doğrulama ve şifre sıfırlama yolları kendi
 * kullandıkları kodu zaten siliyor (clearUserOTP); bu, hiç kullanılmayanlar
 * için. Kayıt silinmez, yalnızca iki sütun boşaltılır.
 */
async function sweepExpiredOtps(): Promise<number> {
  const result = await db
    .update(users)
    .set({ otpCode: null, otpExpiry: null })
    .where(sql`${users.otpExpiry} IS NOT NULL AND ${users.otpExpiry} < NOW()`)
    .returning({ id: users.id });
  return result.length;
}

/** 90 günden eski posta günlüklerini siler. */
async function sweepOldEmailLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - EMAIL_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(emailLogs)
    .where(lt(emailLogs.createdAt, cutoff))
    .returning({ id: emailLogs.id });
  return result.length;
}

export async function runRetentionSweep(): Promise<void> {
  try {
    const otps = await sweepExpiredOtps();
    const logs = await sweepOldEmailLogs();
    if (otps > 0 || logs > 0) {
      console.log(`[RETENTION] ${otps} süresi dolmuş OTP temizlendi, ${logs} posta günlüğü silindi`);
    }
  } catch (error) {
    // Saklama işi uygulamayı düşürmez; bir sonraki turda yeniden denenir.
    console.error("[RETENTION] Süpürme başarısız:", error);
  }
}

export function startRetentionJobs(): void {
  console.log(`[RETENTION] Posta günlükleri ${EMAIL_LOG_RETENTION_DAYS} gün saklanıyor`);
  void runRetentionSweep();
  setInterval(() => void runRetentionSweep(), SWEEP_INTERVAL_MS);
}
