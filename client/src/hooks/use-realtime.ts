import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/hooks/use-auth";

/* Singleton socket — shared across the app. */
let globalSocket: Socket | null = null;

function getSocket(): Socket {
  if (!globalSocket) {
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
 * Realtime events can arrive in bursts (imports, carrier sync, bulk actions).
 * Refetching 3 large endpoints for every single event made the UI stutter.
 * Debounce the burst into one refresh and only refetch queries that are
 * currently mounted/visible.
 */
export function useRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const joinedRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.storeId) return;
    const socket = getSocket();

    function joinStore() {
      if (joinedRef.current) return;
      socket.emit("join_store", user!.storeId);
      joinedRef.current = true;
    }

    function scheduleRefresh() {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        // Prefix /api/orders already covers /api/orders/filtered and other
        // mounted order queries; don't invalidate the same cache twice.
        queryClient.invalidateQueries({
          queryKey: ["/api/orders"],
          refetchType: "active",
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/stats/filtered"],
          refetchType: "active",
        });
      }, 350);
    }

    function onNewOrder() { scheduleRefresh(); }
    function onOrderUpdated() { scheduleRefresh(); }

    socket.on("connect", joinStore);
    if (socket.connected) joinStore();
    socket.on("new_order", onNewOrder);
    socket.on("order_updated", onOrderUpdated);

    return () => {
      socket.off("connect", joinStore);
      socket.off("new_order", onNewOrder);
      socket.off("order_updated", onOrderUpdated);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
      joinedRef.current = false;
    };
  }, [user?.storeId, queryClient]);
}
