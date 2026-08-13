import { Resend } from "resend";
import { storage } from "./storage";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || "XOXO <noreply@xoxo-apps.com>";
const OTP_TTL_MINUTES = 10;

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function getOTPExpiry(): Date {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
}

function otpTemplate(title: string, intro: string, code: string) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:32px;background:#0b0410;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:480px;margin:0 auto;background:#160a20;border:1px solid #3b1a4d;border-radius:20px;padding:36px;text-align:center">
<h1 style="margin:0 0 8px;font-size:30px;letter-spacing:2px;color:#ff3fa4">XOXO</h1>
<p style="margin:0 0 24px;color:#b48ac9;font-size:13px">Gossip AI</p>
<h2 style="margin:0 0 12px;color:#fff;font-size:19px">${title}</h2>
<p style="margin:0 0 24px;color:#c9b3d6;font-size:14px;line-height:1.6">${intro}</p>
<div style="display:inline-block;padding:16px 32px;background:#240f33;border:1px solid #ff3fa4;border-radius:12px;font-size:32px;letter-spacing:10px;color:#fff;font-weight:700">${code}</div>
<p style="margin:24px 0 0;color:#8a6f9c;font-size:12px">Kod ${OTP_TTL_MINUTES} dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayın.</p>
</div></body></html>`;
}

async function send(to: string, subject: string, html: string, type: string) {
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) {
      console.error("[EMAIL ERROR]", type, to, error);
      await storage.logEmail(to, type, false, String(error.message ?? error));
      return false;
    }
    await storage.logEmail(to, type, true);
    return true;
  } catch (err) {
    console.error("[EMAIL ERROR]", type, to, err);
    await storage.logEmail(to, type, false, String(err));
    return false;
  }
}

export async function sendVerificationEmail(email: string, otpCode: string, userId?: number | string) {
  return send(
    email,
    "XOXO — E-posta doğrulama kodun",
    otpTemplate("E-postanı doğrula", "Hesabını aktifleştirmek için aşağıdaki kodu uygulamaya gir.", otpCode),
    "verification",
  );
}

export async function sendPasswordResetEmail(email: string, otpCode: string, userId?: number | string) {
  return send(
    email,
    "XOXO — Şifre sıfırlama kodun",
    otpTemplate("Şifreni sıfırla", "Yeni şifre belirlemek için aşağıdaki kodu uygulamaya gir.", otpCode),
    "password_reset",
  );
}
