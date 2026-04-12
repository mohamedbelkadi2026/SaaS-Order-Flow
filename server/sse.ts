import type { Response } from "express";

const clients = new Map<number, Set<Response>>();

// Global WA clients — subscribed via /api/automation/whatsapp/events
const waClients = new Set<Response>();

export function addSSEClient(storeId: number, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  if (!clients.has(storeId)) clients.set(storeId, new Set());
  clients.get(storeId)!.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch (_) {}
  }, 20000);

  res.on("close", () => {
    clearInterval(heartbeat);
    clients.get(storeId)?.delete(res);
  });
}

/** Add a client to the global WhatsApp events stream */
export function addWASSEClient(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  waClients.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch (_) {}
  }, 20000);

  res.on("close", () => {
    clearInterval(heartbeat);
    waClients.delete(res);
  });
}

// Periodically purge dead SSE connections to prevent memory leaks
setInterval(() => {
  for (const [storeId, set] of clients.entries()) {
    const before = set.size;
    for (const res of set) {
      if ((res as any).writableEnded || (res as any).destroyed) set.delete(res);
    }
    const removed = before - set.size;
    if (removed > 0) console.log(`[SSE Cleanup] Store ${storeId}: removed ${removed} dead connection(s)`);
  }
  const waBefore = waClients.size;
  for (const res of waClients) {
    if ((res as any).writableEnded || (res as any).destroyed) waClients.delete(res);
  }
  const waRemoved = waBefore - waClients.size;
  if (waRemoved > 0) console.log(`[SSE Cleanup] WA global: removed ${waRemoved} dead connection(s)`);
}, 5 * 60 * 1000);

export function broadcastToStore(storeId: number, event: string, data: unknown) {
  // storeId=0 means broadcast to global WA clients
  if (storeId === 0) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of waClients) {
      try { res.write(payload); } catch (_) {}
    }
    return;
  }
  const store = clients.get(storeId);
  if (!store || store.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of store) {
    try { res.write(payload); } catch (_) {}
  }
}
