import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

/**
 * Encryption for stored third-party tokens (YouCan OAuth, Google Sheets…).
 *
 * The key used to be derived from SESSION_SECRET alone, falling back to a fixed
 * placeholder when it was unset. Setting SESSION_SECRET — needed so a deploy
 * stops logging everyone out — therefore silently changed the key, and every
 * token encrypted before could no longer be read: YouCan orders were refused
 * with "Unsupported state or unable to authenticate data" and lost.
 *
 * Decryption now tries every key that may have been in use, newest first, so
 * existing tokens keep working whichever key wrote them. Encryption uses the
 * current key, so tokens migrate as they are next rewritten.
 *
 * ENCRYPTION_KEY takes precedence when set: it decouples token encryption from
 * session signing, so rotating one can never break the other again.
 */
const LEGACY_PLACEHOLDER = "dev-placeholder-key-must-be-set!!";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** Key used to encrypt new values. */
function currentSecret(): string {
  return process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || LEGACY_PLACEHOLDER;
}

/**
 * Every key that may have encrypted a stored value, newest first. The legacy
 * placeholder stays in the list: everything written before SESSION_SECRET was
 * set depends on it.
 */
function candidateSecrets(): string[] {
  const all = [
    process.env.ENCRYPTION_KEY,
    process.env.SESSION_SECRET,
    LEGACY_PLACEHOLDER,
  ].filter((s): s is string => !!s);
  return Array.from(new Set(all));
}

export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(currentSecret()), iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${enc.toString("hex")}.${tag.toString("hex")}`;
}

export function decrypt(encoded: string): string {
  const parts = encoded.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted token format");
  const [ivHex, encHex, tagHex] = parts;

  let lastErr: unknown;
  for (const secret of candidateSecrets()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(ivHex, "hex"));
      decipher.setAuthTag(Buffer.from(tagHex, "hex"));
      return Buffer.concat([
        decipher.update(Buffer.from(encHex, "hex")),
        decipher.final(),
      ]).toString("utf8");
    } catch (err) {
      // GCM authentication failure: wrong key for this value, try the next.
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Unable to decrypt value with any known key");
}
