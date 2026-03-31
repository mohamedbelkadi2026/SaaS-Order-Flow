import { Resend } from "resend";
import { randomInt } from "crypto";

export function generateOTP(): string {
  return String(randomInt(100000, 999999));
}

/**
 * Resolves the "from" address:
 *   - If RESEND_FROM_EMAIL is set in env (e.g. "no-reply@tajergrow.com"),
 *     use "TajerGrow <{RESEND_FROM_EMAIL}>"
 *   - Otherwise fall back to Resend's shared test domain (works on free tier
 *     for the account owner's own email only).
 *
 * After verifying tajergrow.com in Resend, add to Railway Variables:
 *   RESEND_FROM_EMAIL = no-reply@tajergrow.com
 */
function getSenderAddress(): string {
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  if (fromEmail) return `TajerGrow <${fromEmail}>`;
  return "TajerGrow <onboarding@resend.dev>";
}

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  // Always log the code in plain text — readable in both Replit and Railway dashboards
  console.log("[EMAIL] ============================================================");
  console.log(`[EMAIL] Verification code for: ${email}`);
  console.log(`[EMAIL] CODE: ${code}`);
  console.log("[EMAIL] ============================================================");

  // API key guard
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error("[EMAIL] ERROR: RESEND_API_KEY is not set. Email will NOT be sent.");
    console.error("[EMAIL] Add RESEND_API_KEY to Railway Variables and redeploy.");
    return;
  }
  const sender = getSenderAddress();
  console.log(`[EMAIL] API key loaded OK (prefix: ${apiKey.slice(0, 8)}...)`);
  console.log(`[EMAIL] Sender: ${sender}`);
  console.log(`[EMAIL] Recipient: ${email}`);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#1e1b4b;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#C5A059;font-size:24px;font-weight:800;letter-spacing:1px;">TajerGrow</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">La plateforme COD marocaine</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 8px;color:#1e1b4b;font-size:20px;font-weight:700;">Vérifiez votre adresse email</h2>
          <p style="margin:0 0 28px;color:#6b7280;font-size:14px;line-height:1.6;">
            Bonjour ! Utilisez le code ci-dessous pour activer votre compte. Il expire dans <strong>10 minutes</strong>.
          </p>
          <div style="text-align:center;margin:0 0 28px;">
            <div style="display:inline-block;background:#1e1b4b;border-radius:12px;padding:20px 40px;">
              <span style="font-size:36px;font-weight:900;color:#C5A059;letter-spacing:12px;font-family:monospace;">${code}</span>
            </div>
          </div>
          <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;text-align:center;">
            Si vous n'avez pas créé de compte sur TajerGrow, ignorez cet email.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:11px;">© ${new Date().getFullYear()} TajerGrow · Plateforme COD Maroc</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    console.log("[EMAIL] Sending via Resend API...");
    const client = new Resend(apiKey);
    const { data, error } = await client.emails.send({
      from: sender,
      to: [email],
      subject: "Votre code de vérification TajerGrow",
      html,
      text: `Bonjour ! Votre code d'activation TajerGrow est : ${code}\n\nCe code expire dans 10 minutes.`,
    });

    if (error) {
      const errName    = (error as any).name    || "UnknownError";
      const errMsg     = (error as any).message || JSON.stringify(error);
      const statusCode = (error as any).statusCode ?? "";

      console.error(`[EMAIL] Resend API error [${statusCode}] ${errName}: ${errMsg}`);

      if (errMsg.includes("testing emails") || errMsg.includes("verify a domain")) {
        console.error("[EMAIL] FREE TIER RESTRICTION: You must verify tajergrow.com at");
        console.error("[EMAIL] https://resend.com/domains then set:");
        console.error("[EMAIL]   RESEND_FROM_EMAIL = no-reply@tajergrow.com  (Railway Variable)");
        console.error("[EMAIL] Until then, use the CODE printed above to verify manually.");
      } else if (String(statusCode) === "401" || String(statusCode) === "403") {
        console.error("[EMAIL] Auth error — double-check RESEND_API_KEY in Railway Variables.");
      }
      // Don't throw: code is already saved in DB, user can enter it even if email fails
      return;
    }

    console.log(`[EMAIL] SUCCESS — email delivered. Resend ID: ${data?.id}`);
  } catch (err: any) {
    console.error(`[EMAIL] Exception while calling Resend: ${err.message}`);
    console.error("[EMAIL] Full error:", err);
    console.error("[EMAIL] The OTP code above is still valid — user can enter it manually.");
  }
}
