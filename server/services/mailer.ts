import { Resend } from "resend";
import { randomInt } from "crypto";

export function generateOTP(): string {
  return String(randomInt(100000, 999999));
}

// ── The sender address ──────────────────────────────────────────────────────
// tajergrow.com is verified in Resend — no-reply@tajergrow.com is the default.
// Override via RESEND_FROM_EMAIL env var if ever needed.
function getSender(): string {
  const override = process.env.RESEND_FROM_EMAIL?.trim();
  return override ? `TajerGrow <${override}>` : "TajerGrow <no-reply@tajergrow.com>";
}

// ── HTML email template ─────────────────────────────────────────────────────
function buildEmailHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code de vérification TajerGrow</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:48px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:#1e1b4b;padding:36px 48px;text-align:center;">
            <div style="display:inline-block;background:rgba(197,160,89,0.15);border:1.5px solid rgba(197,160,89,0.35);border-radius:12px;padding:10px 22px;margin-bottom:12px;">
              <span style="font-size:22px;font-weight:900;letter-spacing:2px;color:#C5A059;">TajerGrow</span>
            </div>
            <p style="margin:0;color:rgba(255,255,255,0.55);font-size:13px;letter-spacing:0.5px;">La plateforme COD marocaine</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:44px 48px 32px;">
            <h1 style="margin:0 0 10px;color:#1e1b4b;font-size:22px;font-weight:800;">Vérifiez votre adresse email</h1>
            <p style="margin:0 0 32px;color:#6b7280;font-size:15px;line-height:1.7;">
              Bonjour et bienvenue sur TajerGrow&nbsp;! Pour activer votre compte, entrez le code ci-dessous dans les <strong>15&nbsp;minutes</strong>.
            </p>

            <!-- OTP Box -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding-bottom:32px;">
                <div style="display:inline-block;background:#1e1b4b;border-radius:16px;padding:24px 48px;">
                  <span style="font-size:44px;font-weight:900;color:#C5A059;letter-spacing:14px;font-family:'Courier New',Courier,monospace;">${code}</span>
                </div>
              </td></tr>
            </table>

            <p style="margin:0 0 6px;color:#9ca3af;font-size:12px;text-align:center;">
              Ce code expire dans&nbsp;<strong>15&nbsp;minutes</strong>.
            </p>
            <p style="margin:0;color:#d1d5db;font-size:11px;text-align:center;">
              Si vous n'avez pas créé de compte sur TajerGrow, ignorez simplement cet email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 48px;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:11px;">
              © ${new Date().getFullYear()} TajerGrow · Plateforme COD Maroc<br>
              <a href="https://www.tajergrow.com" style="color:#C5A059;text-decoration:none;">www.tajergrow.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Main send function ──────────────────────────────────────────────────────
export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  // ── Step 1: Always log OTP first — readable in Railway even if everything else fails ──
  console.log("==================================================================");
  console.log(`[OTP_BACKDOOR]: Email: ${email} | Code: ${code}`);
  console.log(`[SERVER-OTP]: The code for user ${email} is ${code}`);
  console.log('--- [AUTH-DEBUG] --- Email: ' + email + ' | Code: ' + code);
  console.log('[AUTH-CODE-FOR-USER]:', email, 'code is:', code);
  console.log("==================================================================");

  // ── Step 2: Validate API key ────────────────────────────────────────────────
  const apiKey = process.env.RESEND_API_KEY?.trim();
  console.log('[DEBUG]: Using API Key starting with: ' + process.env.RESEND_API_KEY?.substring(0, 7));

  if (!apiKey) {
    console.error('MISSING RESEND_API_KEY IN SECRETS');
    console.error("[MAILER] Add RESEND_API_KEY to Railway Variables → Redeploy.");
    return;
  }

  // ── Step 3: Send email ──────────────────────────────────────────────────────
  const sender = getSender();
  console.log(`[RESEND_STATUS]: Email attempt for ${email}`);
  console.log(`[EMAIL_INIT]: Attempting to send code to ${email}`);
  console.log(`[MAILER] From: ${sender} → To: ${email}`);

  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from: sender,
      to: [email],
      subject: "Votre code de vérification TajerGrow",
      html: buildEmailHtml(code),
      text: `Bonjour ! Votre code d'activation TajerGrow est : ${code}\n\nCe code expire dans 15 minutes.\n\nSi vous n'avez pas créé de compte, ignorez cet email.`,
    });
    console.log('[RESEND_API_RESPONSE]:', JSON.stringify(response, null, 2));
    const { data, error } = response;

    // Resend SDK returns soft errors as { data: null, error: {...} } rather than throwing.
    // We must check this explicitly — these include 401 (bad key), 403 (domain), etc.
    if (error) {
      console.error('[RESEND_CRITICAL_ERROR]:', JSON.stringify(error, null, 2));
      console.error('[RESEND_CRITICAL_ERROR] message:', (error as any)?.message);
      console.error('[RESEND_CRITICAL_ERROR] status:', (error as any)?.statusCode ?? (error as any)?.status);
      console.error(`[MAILER] OTP ${code} for ${email} is saved in DB — user can still enter it manually from logs above.`);
      return;
    }

    console.log('[RESEND_SUCCESS]:', JSON.stringify(data, null, 2));
    console.log(`[RESEND]: Email sent to ${email}`);
    console.log(`[EMAIL_SUCCESS]: Message ID ${data?.id ?? 'unknown'}`);
  } catch (error: any) {
    // True exceptions — network failure, SDK crash, etc.
    console.error('[RESEND_CRITICAL_ERROR]:', JSON.stringify(error, null, 2));
    console.error('[RESEND_CRITICAL_ERROR] message:', error?.message);
    console.error('[RESEND_CRITICAL_ERROR] status:', error?.statusCode ?? error?.status);
    console.error(`[MAILER] OTP ${code} for ${email} is saved in DB — user can still enter it manually from logs above.`);
  }
}

// ── Test send (super-admin use only) ───────────────────────────────────────
export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY not set" };
  }

  const sender = getSender();
  console.log(`[EMAIL_INIT]: Attempting to send test email to ${toEmail}`);

  try {
    const client = new Resend(apiKey);
    const { data, error } = await client.emails.send({
      from: sender,
      to: [toEmail],
      subject: "TajerGrow — Test de connexion Resend ✅",
      html: `
        <div style="font-family:sans-serif;padding:32px;background:#f0f2f5;">
          <div style="background:#1e1b4b;color:#C5A059;padding:24px 32px;border-radius:16px;text-align:center;margin-bottom:24px;">
            <h2 style="margin:0;font-size:20px;">TajerGrow — Connexion Resend OK</h2>
          </div>
          <p style="color:#374151;font-size:15px;">
            Ce message confirme que le service d'envoi d'emails est <strong>100% opérationnel</strong>
            depuis <code>no-reply@tajergrow.com</code>.
          </p>
          <p style="color:#6b7280;font-size:12px;">Envoyé le ${new Date().toISOString()}</p>
        </div>`,
      text: `TajerGrow Resend test OK — ${new Date().toISOString()}`,
    });

    if (error) {
      console.error(`[EMAIL_ERROR]: Full error details: ${JSON.stringify(error)}`);
      return { success: false, error: JSON.stringify(error) };
    }

    console.log(`[EMAIL_SUCCESS]: Message ID ${data?.id} (test to ${toEmail})`);
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    console.error(`[EMAIL_ERROR]: Full error details: ${JSON.stringify({ message: err.message })}`);
    return { success: false, error: err.message };
  }
}
