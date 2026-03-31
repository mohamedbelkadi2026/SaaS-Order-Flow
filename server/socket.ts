import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";

/* ─── Singleton ───────────────────────────────────────────── */
let io: SocketIOServer | null = null;

const ALLOWED_ORIGINS = [
  "https://tajergrow.com",
  "https://www.tajergrow.com",
  /https:\/\/.*\.railway\.app$/,
  /https:\/\/.*\.up\.railway\.app$/,
];

export function initSocket(httpServer: HttpServer): SocketIOServer {
  if (io) return io;

  const isProduction = process.env.NODE_ENV === "production";

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || !isProduction) return callback(null, true);
        const ok = ALLOWED_ORIGINS.some((allowed) =>
          allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
        );
        callback(ok ? null : new Error("CORS"), ok);
      },
      credentials: true,
    },
    transports: ["websocket", "polling"],
    path: "/socket.io",
  });

  io.on("connection", (socket) => {
    // Each client sends join_store right after connecting
    socket.on("join_store", (storeId: number) => {
      if (!storeId || typeof storeId !== "number") return;
      socket.join(`store:${storeId}`);
      console.log(`[Socket] Client joined store:${storeId} (${socket.id})`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id} — ${reason}`);
    });
  });

  console.log("[Socket] Socket.io server initialized");
  return io;
}

/* ─── Emit helpers (call from routes.ts) ─────────────────── */
export function emitNewOrder(storeId: number, order: any) {
  if (!io) return;
  io.to(`store:${storeId}`).emit("new_order", order);
}

export function emitOrderUpdated(storeId: number, orderId: number, status: string) {
  if (!io) return;
  io.to(`store:${storeId}`).emit("order_updated", { orderId, status });
}
