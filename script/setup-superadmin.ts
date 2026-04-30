import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { db } from "../server/db";
import { users, stores, subscriptions } from "../shared/schema";
import { eq } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

// ── Credentials are read from env only — fail closed if missing. ────────────
// Set these in your shell/CI before running:
//   SUPER_ADMIN_EMAIL=admin@example.com
//   SUPER_ADMIN_PASSWORD='<a strong password you generated>'
//   SUPER_ADMIN_USERNAME='Admin Display Name'   # optional
//
// On Replit: add them in Secrets (or `export` in the shell) before
// running `tsx script/setup-superadmin.ts`.
// On Railway: set them as Variables, then run via Railway's run-command UI.
const SUPER_ADMIN_EMAIL    = process.env.SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const SUPER_ADMIN_USERNAME = process.env.SUPER_ADMIN_USERNAME || "TajerGrow Admin";

if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
  console.error("=========================================================");
  console.error("[Setup] Refusing to run — missing required env vars.");
  console.error("[Setup] Required: SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD");
  console.error("[Setup] Optional: SUPER_ADMIN_USERNAME");
  console.error("[Setup]");
  console.error("[Setup] Example:");
  console.error("[Setup]   SUPER_ADMIN_EMAIL=you@example.com \\");
  console.error("[Setup]   SUPER_ADMIN_PASSWORD='your-strong-password' \\");
  console.error("[Setup]   tsx script/setup-superadmin.ts");
  console.error("=========================================================");
  process.exit(1);
}

// Light strength check so the script doesn't accept "abc" by accident.
if (SUPER_ADMIN_PASSWORD.length < 12) {
  console.error("[Setup] SUPER_ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

async function main() {
  console.log("[Setup] Checking super admin account...");

  const hashedPassword = await hashPassword(SUPER_ADMIN_PASSWORD!);

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, SUPER_ADMIN_EMAIL!));

  if (existingUser) {
    await db
      .update(users)
      .set({
        password: hashedPassword,
        isSuperAdmin: 1,
        role: "owner",
        isActive: 1,
        username: SUPER_ADMIN_USERNAME,
      })
      .where(eq(users.email, SUPER_ADMIN_EMAIL!));
    console.log(`[Setup] Super admin updated: ${SUPER_ADMIN_EMAIL}`);
  } else {
    let storeId: number | null = null;

    const [existingStore] = await db
      .select()
      .from(stores)
      .where(eq(stores.name, "TajerGrow HQ"));

    if (existingStore) {
      storeId = existingStore.id;
    } else {
      const [newStore] = await db
        .insert(stores)
        .values({ name: "TajerGrow HQ" })
        .returning();
      storeId = newStore.id;

      await db.insert(subscriptions).values({
        storeId,
        plan: "enterprise",
        monthlyLimit: 999999,
        pricePerMonth: 0,
        currentMonthOrders: 0,
        isActive: 1,
      });
      console.log(`[Setup] Store created: TajerGrow HQ (id=${storeId})`);
    }

    await db.insert(users).values({
      username: SUPER_ADMIN_USERNAME,
      email: SUPER_ADMIN_EMAIL!,
      password: hashedPassword,
      role: "owner",
      storeId,
      isSuperAdmin: 1,
      isActive: 1,
    });

    console.log(`[Setup] Super admin created: ${SUPER_ADMIN_EMAIL}`);
  }

  console.log("[Setup] Done. You can now log in with the email above.");
  // Note: we deliberately do NOT echo the password back to stdout —
  // it should already be in your env / secret manager.
  process.exit(0);
}

main().catch((err) => {
  console.error("[Setup] Error:", err);
  process.exit(1);
});
