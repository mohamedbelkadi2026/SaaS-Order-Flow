/**
 * TajerGrow — WhatsApp Engine (Stub)
 *
 * @whiskeysockets/baileys is not available in this environment.
 * All exports are stubbed so the rest of the app boots normally.
 * WhatsApp features (QR scan, send messages) will show a "not available"
 * response until the package can be installed.
 */

import path from "path";
import fs from "fs/promises";

export type WAState = "idle" | "qr" | "connecting" | "connected";

export interface BaileysSessionInstance {
  start(): Promise<void>;
  resetAndRestart(): Promise<void>;
  logout(): Promise<void>;
  disconnect?(): Promise<void>;
  getStatus(): { state: WAState; phone: string | null; qr: string | null };
  sendMessage(phone: string, text: string): Promise<boolean>;
  sendImage(phone: string, imageUrl: string, caption: string): Promise<boolean>;
  isConnected(): boolean;
  requestPairingCode(phoneNumber: string): Promise<string>;
}

const DATA_DIR = process.env.DATA_DIR ?? process.cwd();
const MULTI_AUTH_BASE = path.join(DATA_DIR, "auth_info");

export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return `212${digits.slice(1)}`;
  return digits;
}

function createStubSession(id: number | string): BaileysSessionInstance {
  const tag = `WA-STUB:${id}`;
  return {
    async start() { console.warn(`[${tag}] WhatsApp not available — baileys package blocked`); },
    async resetAndRestart() { console.warn(`[${tag}] WhatsApp not available`); },
    async logout() { console.warn(`[${tag}] WhatsApp not available`); },
    async disconnect() { console.warn(`[${tag}] WhatsApp not available`); },
    getStatus() { return { state: "idle" as WAState, phone: null, qr: null }; },
    async sendMessage() { console.warn(`[${tag}] WhatsApp not available — message dropped`); return false; },
    async sendImage() { console.warn(`[${tag}] WhatsApp not available — image dropped`); return false; },
    isConnected() { return false; },
    async requestPairingCode() { throw new Error("WhatsApp not available in this environment"); },
  };
}

const _sessions = new Map<number, BaileysSessionInstance>();
const _deviceSessions = new Map<number, BaileysSessionInstance>();

export function getBaileysInstance(storeId: number): BaileysSessionInstance {
  if (!_sessions.has(storeId)) {
    _sessions.set(storeId, createStubSession(storeId));
  }
  return _sessions.get(storeId)!;
}

export function getDeviceInstance(deviceId: number, storeId: number): BaileysSessionInstance {
  if (!_deviceSessions.has(deviceId)) {
    _deviceSessions.set(deviceId, createStubSession(`dev-${deviceId}-store-${storeId}`));
  }
  return _deviceSessions.get(deviceId)!;
}

export function removeDeviceInstance(deviceId: number): void {
  _deviceSessions.delete(deviceId);
}

export async function getConnectedDevicesForStore(_storeId: number): Promise<{ id: number; phone: string }[]> {
  return [];
}

export async function autoStartBaileys(): Promise<void> {
  console.log("[WA-AUTO] Baileys stub — skipping auto-start (package not available)");
}

export async function autoStartDevices(): Promise<void> {
  console.log("[WA-AUTO-DEV] Baileys stub — skipping device auto-start (package not available)");
}

export function clearQueue(): void {
  // no-op stub
}
