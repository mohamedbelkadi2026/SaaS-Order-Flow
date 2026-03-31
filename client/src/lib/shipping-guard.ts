/**
 * shipping-guard.ts
 * Client-side pre-shipping validation for Moroccan COD orders.
 * Validates city (against carrier list), phone, and address.
 */
import { findBestCityMatch } from "@/lib/carrier-cities";

export interface OrderValidationResult {
  orderId: number;
  orderNumber: string;
  customerName: string;
  valid: boolean;
  cityError?: string;
  phoneError?: string;
  addressError?: string;
  suggestedCity?: string;
}

/** Normalize a Moroccan phone number for validation */
function normalizePhone(raw: string): string {
  return (raw || "").replace(/[\s\-().+]/g, "");
}

/** Returns true if the phone looks like a valid Moroccan mobile/landline */
function isValidMoroccanPhone(raw: string): boolean {
  const cleaned = normalizePhone(raw);
  // Accept international prefix: +212 or 00212
  const local = cleaned.startsWith("00212")
    ? "0" + cleaned.slice(5)
    : cleaned.startsWith("212") && cleaned.length === 12
    ? "0" + cleaned.slice(3)
    : cleaned;
  // Must be exactly 10 digits starting with 0
  return /^0[5-7]\d{8}$/.test(local) || /^0[1-9]\d{8}$/.test(local);
}

/**
 * Validate a single order for shipping.
 * @param order       The order object (must have customerCity, customerPhone, customerAddress)
 * @param cities      The carrier's official city list
 * @param isCarrierSpecific  Whether this is a real carrier city list (not the generic fallback)
 */
export function validateOrderForShipping(
  order: {
    id: number;
    orderNumber?: string;
    customerName?: string;
    customerCity?: string;
    customerPhone?: string;
    customerAddress?: string;
  },
  cities: string[],
  isCarrierSpecific: boolean
): OrderValidationResult {
  const result: OrderValidationResult = {
    orderId: order.id,
    orderNumber: order.orderNumber || `#${order.id}`,
    customerName: order.customerName || "",
    valid: true,
  };

  // ── City validation ──────────────────────────────────────────────
  if (isCarrierSpecific && cities.length > 0) {
    const city = (order.customerCity || "").trim();
    if (!city) {
      result.cityError = "⚠️ المدينة غير محددة — يرجى اختيار المدينة.";
      result.valid = false;
    } else {
      const norm = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const exactMatch = cities.some(c => norm(c) === norm(city));
      if (!exactMatch) {
        const suggestion = findBestCityMatch(city, cities);
        if (suggestion) {
          result.suggestedCity = suggestion;
          // Not blocking — we can auto-correct on the server; mark as warning only
        } else {
          result.cityError = `⚠️ خطأ في المدينة: "${city}" لا تتوافق مع قائمة المدن.`;
          result.valid = false;
        }
      }
    }
  }

  // ── Phone validation ─────────────────────────────────────────────
  const phone = (order.customerPhone || "").trim();
  if (!phone) {
    result.phoneError = "⚠️ رقم الهاتف مفقود.";
    result.valid = false;
  } else if (!isValidMoroccanPhone(phone)) {
    result.phoneError = `⚠️ رقم الهاتف غير صحيح: "${phone}" (يجب أن يكون 10 أرقام مغربية).`;
    result.valid = false;
  }

  // ── Address validation ───────────────────────────────────────────
  const address = (order.customerAddress || "").trim();
  if (!address || address.length < 5) {
    result.addressError = "⚠️ العنوان ناقص: يرجى كتابة العنوان بالكامل قبل الإرسال.";
    result.valid = false;
  }

  return result;
}

/**
 * Validate a batch of orders and return all results.
 */
export function validateOrdersBatch(
  orders: any[],
  cities: string[],
  isCarrierSpecific: boolean
): OrderValidationResult[] {
  return orders.map(o => validateOrderForShipping(o, cities, isCarrierSpecific));
}
