import type { QueryClient } from "@tanstack/react-query";

// SSE and Socket.io can describe the same change. Share one refresh window
// across subscribers, and never cancel/restart an expensive in-flight read.
// A change arriving during a read guarantees one subsequent refresh, so the
// final state cannot be lost when an import or carrier sync ends.
const states = new WeakMap<QueryClient, { dirty: boolean; refreshing: boolean; timer?: ReturnType<typeof setTimeout> }>();
const keys = ["/api/orders", "/api/orders/filtered", "/api/orders/all",
  "/api/stats/filtered", "/api/stats", "/api/agents/performance", "/api/agents/performance-by-assignment"];

export function scheduleOrderRefresh(client: QueryClient) {
  let state = states.get(client);
  if (!state) {
    state = { dirty: false, refreshing: false };
    states.set(client, state);
  }
  state.dirty = true;
  if (state.timer || state.refreshing) return;
  state.timer = setTimeout(async () => {
    state!.timer = undefined;
    // If a read predates this event, let it finish, then read once more.
    state!.dirty = keys.some(key => client.isFetching({ queryKey: [key] }) > 0);
    state!.refreshing = true;
    try {
      await Promise.allSettled(keys.map(key => client.invalidateQueries(
        { queryKey: [key], refetchType: "active" }, { cancelRefetch: false },
      )));
    } finally {
      state!.refreshing = false;
      if (state!.dirty) scheduleOrderRefresh(client);
    }
  }, 500);
}
