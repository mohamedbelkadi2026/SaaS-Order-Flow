import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

const STORE_ID = 1; // Hardcoded as per instructions

export function useDashboardStats() {
  return useQuery({
    queryKey: [api.stats.get.path, STORE_ID],
    queryFn: async () => {
      const url = buildUrl(api.stats.get.path, { storeId: STORE_ID });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      const data = await res.json();
      return api.stats.get.responses[200].parse(data);
    },
  });
}

export function useOrders() {
  return useQuery({
    queryKey: [api.orders.list.path, STORE_ID],
    queryFn: async () => {
      const url = buildUrl(api.orders.list.path, { storeId: STORE_ID });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      const data = await res.json();
      return data; // Trusting backend for complex OrderWithDetails type
    },
  });
}

export function useOrder(id: number) {
  return useQuery({
    queryKey: [api.orders.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.orders.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch order");
      return await res.json();
    },
    enabled: !!id,
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const url = buildUrl(api.orders.updateStatus.path, { id });
      const res = await fetch(url, {
        method: api.orders.updateStatus.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update status");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path, STORE_ID] });
      queryClient.invalidateQueries({ queryKey: [api.stats.get.path, STORE_ID] });
    },
  });
}

export function useAssignAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, agentId }: { id: number; agentId: number | null }) => {
      const url = buildUrl(api.orders.assign.path, { id });
      const res = await fetch(url, {
        method: api.orders.assign.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to assign agent");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path, STORE_ID] });
    },
  });
}

export function useProducts() {
  return useQuery({
    queryKey: [api.products.list.path, STORE_ID],
    queryFn: async () => {
      const url = buildUrl(api.products.list.path, { storeId: STORE_ID });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      const data = await res.json();
      return api.products.list.responses[200].parse(data);
    },
  });
}

export function useAgents() {
  return useQuery({
    queryKey: [api.agents.list.path, STORE_ID],
    queryFn: async () => {
      const url = buildUrl(api.agents.list.path, { storeId: STORE_ID });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data = await res.json();
      return api.agents.list.responses[200].parse(data);
    },
  });
}
