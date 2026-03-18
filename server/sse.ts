import type { Response } from "express";

const clients = new Map<number, Set<Response>>();

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

export function broadcastToStore(storeId: number, event: string, data: unknown) {
  const store = clients.get(storeId);
  if (!store || store.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of store) {
    try { res.write(payload); } catch (_) {}
  }
}
