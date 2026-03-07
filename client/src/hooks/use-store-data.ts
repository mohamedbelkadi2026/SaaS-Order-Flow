import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["/api/stats"],
    queryFn: async () => {
      const res = await fetch("/api/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });
}

export function useOrders(status?: string) {
  const url = status ? `/api/orders?status=${status}` : "/api/orders";
  return useQuery({
    queryKey: ["/api/orders", status || "all"],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
  });
}

export function useOrder(id: number) {
  return useQuery({
    queryKey: ["/api/orders", id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch order");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/orders/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
  });
}

export function useAssignAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, agentId }: { id: number; agentId: number | null }) => {
      const res = await apiRequest("PATCH", `/api/orders/${id}/assign`, { agentId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await fetch("/api/products", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
  });
}

export function useAgents() {
  return useQuery({
    queryKey: ["/api/agents"],
    queryFn: async () => {
      const res = await fetch("/api/agents", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch agents");
      return res.json();
    },
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      username: string;
      email: string;
      phone?: string;
      password: string;
      paymentType?: string;
      paymentAmount?: number;
      distributionMethod?: string;
      isActive?: number;
    }) => {
      const res = await apiRequest("POST", "/api/agents", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
    },
  });
}

export function useAdSpend(date?: string) {
  const url = date ? `/api/ad-spend?date=${date}` : "/api/ad-spend";
  return useQuery({
    queryKey: ["/api/ad-spend", date || "all"],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ad spend");
      return res.json();
    },
  });
}

export function useUpsertAdSpend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { productId?: number | null; date: string; amount: number }) => {
      const res = await apiRequest("POST", "/api/ad-spend", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad-spend"] });
    },
  });
}

export function useIntegrations(type?: string) {
  const url = type ? `/api/integrations?type=${type}` : "/api/integrations";
  return useQuery({
    queryKey: ["/api/integrations", type || "all"],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch integrations");
      return res.json();
    },
  });
}

export function useCreateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { provider: string; type: string; credentials: Record<string, string> }) => {
      const res = await apiRequest("POST", "/api/integrations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integration-logs"] });
    },
  });
}

export function useUpdateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; credentials?: Record<string, string>; isActive?: number }) => {
      const res = await apiRequest("PATCH", `/api/integrations/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integration-logs"] });
    },
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/integrations/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integration-logs"] });
    },
  });
}

export function useIntegrationLogs(limit = 100) {
  return useQuery({
    queryKey: ["/api/integration-logs", limit],
    queryFn: async () => {
      const res = await fetch(`/api/integration-logs?limit=${limit}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch integration logs");
      return res.json();
    },
  });
}

export function useShipOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, provider }: { id: number; provider: string }) => {
      const res = await apiRequest("POST", `/api/orders/${id}/ship`, { provider });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integration-logs"] });
    },
  });
}
