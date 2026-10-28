import { db } from "./db";
import { aiSettings } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// An instance must identify exactly one store. Ambiguous legacy links fail
// closed instead of choosing the first account or matching a customer's phone.
export async function findGreenApiStore(instanceId: string): Promise<number | null> {
  if (!/^\d{4,20}$/.test(instanceId)) return null;
  const owners = await db.select({ storeId: aiSettings.storeId }).from(aiSettings)
    .where(sql`trim(${aiSettings.greenApiInstanceId}) = ${instanceId}`).limit(2);
  // Zero denotes an ambiguous link; null denotes an unclaimed instance.
  return owners.length === 1 ? owners[0].storeId : owners.length > 1 ? 0 : null;
}

export async function getStoreGreenCredentials(storeId: number) {
  if (!Number.isSafeInteger(storeId) || storeId <= 0) return null;
  const [settings] = await db.select({ instanceId: aiSettings.greenApiInstanceId,
    apiToken: aiSettings.greenApiApiToken }).from(aiSettings).where(eq(aiSettings.storeId, storeId));
  const instanceId = settings?.instanceId?.trim();
  const apiToken = settings?.apiToken?.trim();
  if (!instanceId || !apiToken || await findGreenApiStore(instanceId) !== storeId) return null;
  return { instanceId, apiToken };
}
