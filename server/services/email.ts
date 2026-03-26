import { randomInt } from "crypto";

export function generateOTP(): string {
  return String(randomInt(100000, 999999));
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendViaResend(opts: SendEmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "TajerGrow <noreply@tajergrow.com>",
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
}

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  const subject = "Votre code de vérification TajerGrow";
  const text = `Bonjour ! Votre code pour activer votre compte TajerGrow est : ${code}\n\nCe code expire dans 10 minutes.`;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:#1e1b4b;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#C5A059;font-size:24px;font-weight:800;letter-spacing:1px;">TajerGrow</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">La plateforme COD marocaine</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 8px;color:#1e1b4b;font-size:20px;font-weight:700;">Vérifiez votre adresse email</h2>
          <p style="margin:0 0 28px;color:#6b7280;font-size:14px;line-height:1.6;">
            Bonjour ! Utilisez le code ci-dessous pour activer votre compte. Il expire dans <strong>10 minutes</strong>.
          </p>
          <!-- OTP Box -->
          <div style="text-align:center;margin:0 0 28px;">
            <div style="display:inline-block;background:#1e1b4b;border-radius:12px;padding:20px 40px;">
              <span style="font-size:36px;font-weight:900;color:#C5A059;letter-spacing:12px;font-family:monospace;">${code}</span>
            </div>
          </div>
          <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;text-align:center;">
            Si vous n'avez pas créé de compte sur TajerGrow, ignorez cet email.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:11px;">© 2026 TajerGrow · Plateforme COD Maroc</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  if (process.env.RESEND_API_KEY) {
    await sendViaResend({ to: email, subject, html, text });
    console.log(`[Email] Verification email sent to ${email}`);
  } else {
    console.log(`[Email:DEV] No RESEND_API_KEY set. OTP for ${email} → \x1b[33m${code}\x1b[0m`);
  }
}
