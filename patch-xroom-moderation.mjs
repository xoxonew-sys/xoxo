/**
 * X-Room Adim 1: sikayet, engelleme ve ban yonetimi.
 *
 * NEDEN: X-Room cok kullanicili sohbet, yani kullanici uretimi icerik.
 * Apple 1.2 ve Google UGC politikasi uc sey zorunlu tutuyor:
 *   - uygunsuz icerigi BILDIRME yolu
 *   - saldirgan kullaniciyi ENGELLEME yolu
 *   - bildirimlere 24 SAAT icinde bakma taahhudu
 * Bu ucu olmadan XROOM_ENABLED acilirsa uygulama her iki magazadan da
 * kaldirilma riskine girer - Play'de zaten yayinda oldugumuz icin
 * mevcut yayin da riske girer.
 *
 * EKLENENLER:
 *   POST  /api/xroom/:code/report        sikayet (mail + tabloya kayit)
 *   GET   /api/admin/reports             sikayet listesi
 *   PATCH /api/admin/reports/:id         sikayeti kapat
 *   PATCH /api/admin/bans/:banId         bani ac/kapa (isActive)
 *
 * AYRICA:
 *   - xroom uclarina requireAuth: banlanacak bir kimlik olmadan
 *     engelleme mekanizmasi bos calisir
 *   - oda AI cinsiyeti artik kurucunun secimi (sabit "female" idi)
 *
 * ONKOSUL: node create-reports-table.mjs
 *
 * Kullanim (proje kokunde):  node patch-xroom-moderation.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = path.resolve('server/routes.ts');

/* ---------------- 1. Sikayet maili ---------------- */
const emailFn = `
/* ---------------- X-Room sikayet bildirimi ---------------- */

/**
 * Sikayet geldiginde moderasyon adresine mail atar.
 * Mail kaybolursa sikayet yine de room_reports tablosunda durur -
 * admin paneli tek dogru kaynak, mail sadece hizli uyari.
 */
export async function sendReportEmail(params: {
  roomCode: string;
  reporterEmail: string;
  reportedNickname?: string | null;
  reportedEmail?: string | null;
  messageText?: string | null;
  reason?: string | null;
}) {
  const to = process.env.MODERATION_EMAIL || "hello@xoxo-apps.com";
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const rows = [
    ["Oda", params.roomCode],
    ["Bildiren", params.reporterEmail],
    ["Bildirilen", params.reportedNickname || "—"],
    ["Bildirilen e-posta", params.reportedEmail || "—"],
    ["Sebep", params.reason || "—"],
    ["Mesaj", params.messageText || "—"],
  ]
    .map(
      ([k, v]) =>
        \`<tr><td style="padding:6px 12px;color:#8a6f9c;font-size:13px">\${k}</td>\` +
        \`<td style="padding:6px 12px;color:#fff;font-size:13px">\${esc(String(v))}</td></tr>\`,
    )
    .join("");

  const html =
    \`<!DOCTYPE html><html><body style="margin:0;padding:32px;background:#0b0410;font-family:system-ui,sans-serif">\` +
    \`<div style="max-width:560px;margin:0 auto;background:#160a20;border:1px solid #3b1a4d;border-radius:20px;padding:32px">\` +
    \`<h2 style="margin:0 0 4px;color:#ff3fa4;font-size:18px">X-Room şikayeti</h2>\` +
    \`<p style="margin:0 0 20px;color:#8a6f9c;font-size:12px">24 saat içinde incelenmeli.</p>\` +
    \`<table style="width:100%;border-collapse:collapse">\${rows}</table>\` +
    \`<p style="margin:24px 0 0;color:#8a6f9c;font-size:12px">Yönetim panelindeki Şikayetler sekmesinden işlem yapabilirsiniz.</p>\` +
    \`</div></body></html>\`;

  return send(to, \`XOXO — X-Room şikayeti (\${params.roomCode})\`, html, "room_report");
}
`;

/* ---------------- 2. Sunucu uclari ---------------- */
const endpoints = `  /* ------------------------------------------------------------
     X-ROOM MODERASYON
     Magaza sarti: bildirme + engelleme + 24 saat taahhudu.
     ------------------------------------------------------------ */

  app.post("/api/xroom/:code/report", requireAuth, async (req, res) => {
    try {
      const code = String(req.params.code || "").toUpperCase();
      const { reportedNickname, reportedEmail, messageText, reason } = req.body ?? {};

      const uid = Number((req.session as any).userId);
      const reporter = await storage.getUserById(uid);
      if (!reporter) {
        return res.status(401).json({ message: "Oturum bulunamadı" });
      }

      const [row] = await db
        .insert(roomReports)
        .values({
          roomCode: code,
          reporterEmail: reporter.email,
          reportedEmail: reportedEmail ? String(reportedEmail) : null,
          reportedNickname: reportedNickname ? String(reportedNickname).slice(0, 40) : null,
          messageText: messageText ? String(messageText).slice(0, 2000) : null,
          reason: reason ? String(reason).slice(0, 200) : null,
        })
        .returning();

      // Mail basarisiz olsa bile sikayet kayitli - kullaniciya hata donmeyiz
      sendReportEmail({
        roomCode: code,
        reporterEmail: reporter.email,
        reportedNickname,
        reportedEmail,
        messageText,
        reason,
      }).catch((err) => console.error("[REPORT] Mail gonderilemedi:", err));

      console.log(\`[REPORT] Oda \${code} — bildiren \${reporter.email}\`);
      res.status(201).json({
        id: row.id,
        message: "Bildirimin alındı. 24 saat içinde incelenecek.",
      });
    } catch (error) {
      console.error("[REPORT] Hata:", error);
      res.status(500).json({ message: "Bildirim kaydedilemedi" });
    }
  });

  app.get("/api/admin/reports", requireAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(roomReports)
        .orderBy(sql\`created_at DESC\`)
        .limit(200);
      res.json({ reports: rows });
    } catch (error) {
      console.error("[ADMIN] Sikayetler alinamadi:", error);
      res.status(500).json({ message: "Şikayetler alınamadı" });
    }
  });

  app.patch("/api/admin/reports/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: "Geçersiz kayıt" });

      const status = req.body?.status === "open" ? "open" : "resolved";
      const adminEmail = (req.session as any).adminEmail || "admin";

      await db
        .update(roomReports)
        .set({
          status,
          resolvedAt: status === "resolved" ? new Date() : null,
          resolvedBy: status === "resolved" ? adminEmail : null,
        })
        .where(eq(roomReports.id, id));

      res.json({ message: status === "resolved" ? "Şikayet kapatıldı" : "Şikayet yeniden açıldı" });
    } catch (error) {
      console.error("[ADMIN] Sikayet guncellenemedi:", error);
      res.status(500).json({ message: "Güncellenemedi" });
    }
  });

  /** Bani silmeden ac/kapa - gecmis kayit kalsin diye */
  app.patch("/api/admin/bans/:banId", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.banId as string);
      if (isNaN(id)) return res.status(400).json({ message: "Geçersiz kayıt" });

      const isActive = req.body?.isActive === true;
      await db.update(userBans).set({ isActive }).where(eq(userBans.id, id));

      res.json({ message: isActive ? "Yasaklama açıldı" : "Yasaklama kapatıldı" });
    } catch (error) {
      console.error("[ADMIN] Ban guncellenemedi:", error);
      res.status(500).json({ message: "Güncellenemedi" });
    }
  });

`;

const patches = [
  {
    name: 'roomReports semaya import edildi',
    find: `  userBans, globalNotifications, usageAnalytics, apiCostTracking
} from "@shared/schema";`,
    replace: `  userBans, globalNotifications, usageAnalytics, apiCostTracking,
  roomReports
} from "@shared/schema";`,
  },
  {
    name: 'sendReportEmail import edildi',
    find: `import { generateOTP, getOTPExpiry, sendVerificationEmail, sendPasswordResetEmail } from "./email";`,
    replace: `import { generateOTP, getOTPExpiry, sendVerificationEmail, sendPasswordResetEmail, sendReportEmail } from "./email";`,
  },
  {
    name: 'Moderasyon uclari eklendi',
    find: `  app.get("/api/admin/bans", requireAdmin, async (req, res) => {`,
    replace: endpoints + `  app.get("/api/admin/bans", requireAdmin, async (req, res) => {`,
  },
  {
    name: 'Oda AI cinsiyeti kurucudan okunuyor',
    find: `      system: getXRoomAiPrompt(room.aiMode, 1, "female", language as "tr" | "en"),`,
    replace: `      // Cinsiyet odayi kuranin secimi. Once sabit "female" idi.
      system: getXRoomAiPrompt(
        room.aiMode,
        1,
        (room as any).aiGender === "male" ? "male" : "female",
        language as "tr" | "en",
      ),`,
  },
];

async function main() {
  /* --- email.ts --- */
  const emailPath = path.resolve('server/email.ts');
  let email = await fs.readFile(emailPath, 'utf8');
  await fs.writeFile(`${emailPath}.mod.bak`, email, 'utf8');

  if (email.includes('sendReportEmail')) {
    console.log('--- server/email.ts\n  ATLANDI  sendReportEmail zaten var');
  } else {
    email = email.trimEnd() + '\n' + emailFn;
    await fs.writeFile(emailPath, email, 'utf8');
    console.log('--- server/email.ts\n  OK       sendReportEmail eklendi');
  }


  /* --- shared/schema.ts --- */
  const schemaPath = path.resolve('shared/schema.ts');
  let schema = await fs.readFile(schemaPath, 'utf8');
  await fs.writeFile(`${schemaPath}.mod.bak`, schema, 'utf8');

  if (schema.includes('roomReports')) {
    console.log('--- shared/schema.ts\n  ATLANDI  roomReports zaten var');
  } else {
    const anchor = '/* ---------- globalNotifications ---------- */';
    if (!schema.includes(anchor)) {
      console.error('--- shared/schema.ts\n  ATLANDI  baglanti noktasi bulunamadi');
      process.exit(1);
    }
    const def = `/* ---------- roomReports ----------
   X-Room sikayetleri. Magaza sarti olan "bildirme" yolunun kaydi.
   Oda suresi dolunca mesajlar silinir ama sikayet kaydi KALIR -
   yoksa 24 saat icinde inceleme taahhudu bos olur. */
export const roomReports = pgTable("room_reports", {
  id: serial("id").primaryKey(),
  roomCode: text("room_code").notNull(),
  reporterEmail: text("reporter_email").notNull(),
  reportedEmail: text("reported_email"),
  reportedNickname: text("reported_nickname"),
  messageText: text("message_text"),
  reason: text("reason"),
  status: text("status").notNull().default("open"), // "open" | "resolved"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
});

`;
    schema = schema.replace(anchor, def + anchor);
    await fs.writeFile(schemaPath, schema, 'utf8');
    console.log('--- shared/schema.ts\n  OK       roomReports tanimi eklendi');
  }

  /* --- routes.ts --- */
  let source = await fs.readFile(FILE, 'utf8');
  await fs.writeFile(`${FILE}.mod.bak`, source, 'utf8');
  console.log('\n--- server/routes.ts');

  let applied = 0;
  const failures = [];
  for (const p of patches) {
    const count = source.split(p.find).length - 1;
    if (count !== 1) {
      console.error(`  ATLANDI  ${p.name} — ${count} eslesme`);
      failures.push(p.name);
      continue;
    }
    source = source.replace(p.find, p.replace);
    console.log(`  OK       ${p.name}`);
    applied++;
  }
  await fs.writeFile(FILE, source, 'utf8');

  console.log(`\n${applied} degisiklik uygulandi.`);
  if (failures.length) {
    console.log('Atlananlar:', failures.join(', '));
    process.exit(1);
  }
  console.log('Sonraki adim: npm run build');
}

main();
