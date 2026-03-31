import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/hooks/use-auth";

/* Singleton socket — shared across all hook invocations */
let globalSocket: Socket | null = null;

function getSocket(): Socket {
  if (!globalSocket || !globalSocket.connected) {
    globalSocket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10_000,
    });
  }
  return globalSocket;
}

/**
 * useRealtime — connects to Socket.io, joins the user's store room,
 * and invalidates TanStack Query caches whenever a real-time event arrives.
 *
 * Usage: call once per page that needs live updates (Dashboard, Orders).
 */
export function useRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const joinedRef = useRef(false);

  useEffect(() => {
    if (!user?.storeId) return;

    const socket = getSocket();

    function joinStore() {
      if (joinedRef.current) return;
      socket.emit("join_store", user!.storeId);
      joinedRef.current = true;
      console.log("[Realtime] Joined store:", user!.storeId);
    }

    // Join on connect (handles reconnects too)
    socket.on("connect", joinStore);
    if (socket.connected) joinStore();

    /* ── new_order ─────────────────────────────────── */
    function onNewOrder(order: any) {
      console.log("[Realtime] new_order received:", order?.id);
      // Invalidate orders list + stats so both pages update
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    }

    /* ── order_updated ─────────────────────────────── */
    function onOrderUpdated(payload: { orderId: number; status: string }) {
      console.log("[Realtime] order_updated:", payload);
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    }

    socket.on("new_order",     onNewOrder);
    socket.on("order_updated", onOrderUpdated);

    return () => {
      socket.off("connect",       joinStore);
      socket.off("new_order",     onNewOrder);
      socket.off("order_updated", onOrderUpdated);
      joinedRef.current = false;
    };
  }, [user?.storeId, queryClient]);
}
