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

const SUPER_ADMIN_EMAIL = "mehamadchalabi100@gmail.com";
const SUPER_ADMIN_PASSWORD = "AdminGrow2026!";
const SUPER_ADMIN_USERNAME = "TajerGrow Admin";

async function main() {
  console.log("[Setup] Checking super admin account...");

  const hashedPassword = await hashPassword(SUPER_ADMIN_PASSWORD);

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, SUPER_ADMIN_EMAIL));

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
      .where(eq(users.email, SUPER_ADMIN_EMAIL));
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
      email: SUPER_ADMIN_EMAIL,
      password: hashedPassword,
      role: "owner",
      storeId,
      isSuperAdmin: 1,
      isActive: 1,
    });

    console.log(`[Setup] Super admin created: ${SUPER_ADMIN_EMAIL}`);
  }

  console.log("[Setup] Done. You can now log in with:");
  console.log(`  Email:    ${SUPER_ADMIN_EMAIL}`);
  console.log(`  Password: ${SUPER_ADMIN_PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[Setup] Error:", err);
  process.exit(1);
});
