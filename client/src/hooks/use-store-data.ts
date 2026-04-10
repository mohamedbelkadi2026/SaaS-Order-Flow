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

export function useFilterOptions() {
  return useQuery({
    queryKey: ["/api/stats/filter-options"],
    queryFn: async () => {
      const res = await fetch("/api/stats/filter-options", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch filter options");
      return res.json();
    },
  });
}

export function useFilteredStats(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== 'all') params.set(key, value);
  });
  const queryString = params.toString();
  const url = `/api/stats/filtered${queryString ? `?${queryString}` : ''}`;
  return useQuery({
    queryKey: ["/api/stats/filtered", queryString],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch filtered stats");
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
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/all"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/all"] });
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
      roleInStore?: string;
      leadPercentage?: number;
      allowedProductIds?: number[];
      allowedRegions?: string[];
    }) => {
      const res = await apiRequest("POST", "/api/agents", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/store-settings"] });
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

export function useWebhookKey() {
  return useQuery({
    queryKey: ["/api/store/webhook-key"],
    queryFn: async () => {
      const res = await fetch("/api/store/webhook-key", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch webhook key");
      return res.json() as Promise<{ webhookKey: string }>;
    },
  });
}

export function useVerifyConnection() {
  return useMutation({
    mutationFn: async (params: string | { provider: string; magasinId?: number }) => {
      const provider = typeof params === "string" ? params : params.provider;
      const magasinId = typeof params === "string" ? undefined : params.magasinId;
      const url = magasinId
        ? `/api/integrations/verify/${provider}?magasin_id=${magasinId}`
        : `/api/integrations/verify/${provider}`;
      const res = await apiRequest("POST", url, {});
      return res.json();
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

export function useShopifyIntegrations() {
  return useQuery({
    queryKey: ["/api/integrations/shopify"],
    queryFn: async () => {
      const res = await fetch("/api/integrations/shopify", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch Shopify integrations");
      return res.json() as Promise<any[]>;
    },
  });
}

export function useCreateShopifyIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { storeId: number; connectionName: string }) => {
      const res = await apiRequest("POST", "/api/integrations/shopify", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/shopify"] });
    },
  });
}

export function useToggleShopifyIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/integrations/shopify/${id}/toggle`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/shopify"] });
    },
  });
}

export function useDeleteShopifyIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/integrations/shopify/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/shopify"] });
    },
  });
}

export function useVerifyShopifyIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/integrations/shopify/${id}/verify`, {});
      return res.json() as Promise<{ connected: boolean; ordersCount: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/shopify"] });
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

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      customerName: string;
      customerPhone: string;
      customerAddress?: string;
      customerCity?: string;
      items: { productId: number; quantity: number; price: number }[];
      shippingCost?: number;
      comment?: string;
    }) => {
      const res = await apiRequest("POST", "/api/orders", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
    },
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; [key: string]: any }) => {
      const res = await apiRequest("PATCH", `/api/orders/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/all"] });
    },
  });
}

export function useInventoryStats() {
  return useQuery({
    queryKey: ["/api/products/inventory"],
    queryFn: async () => {
      const res = await fetch("/api/products/inventory", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch inventory stats");
      return res.json();
    },
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/products", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/inventory"] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; [key: string]: any }) => {
      const res = await apiRequest("PATCH", `/api/products/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/inventory"] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/products/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/inventory"] });
    },
  });
}

export function useCustomers() {
  return useQuery({
    queryKey: ["/api/customers"],
    queryFn: async () => {
      const res = await fetch("/api/customers", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: ["/api/subscription"],
    queryFn: async () => {
      const res = await fetch("/api/subscription", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch subscription");
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { plan: string }) => {
      const res = await apiRequest("POST", "/api/subscription", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
    },
  });
}

export function useAgentPerformance() {
  return useQuery({
    queryKey: ["/api/agents/performance"],
    queryFn: async () => {
      const res = await fetch("/api/agents/performance", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch agent performance");
      return res.json();
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/agents/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/performance"] });
    },
  });
}

export function useAdminStores() {
  return useQuery({
    queryKey: ["/api/admin/stores"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stores", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch admin stores");
      return res.json();
    },
  });
}

export function useAdminStats() {
  return useQuery({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch admin stats");
      return res.json();
    },
  });
}

export function useToggleStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ storeId, isActive }: { storeId: number; isActive: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/stores/${storeId}/toggle`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
  });
}

export function useAgentProducts(agentId: number | undefined) {
  return useQuery({
    queryKey: ["/api/agents", agentId, "products"],
    queryFn: async () => {
      if (!agentId) return [];
      const res = await fetch(`/api/agents/${agentId}/products`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch agent products");
      return res.json();
    },
    enabled: !!agentId,
  });
}

export function useSetAgentProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agentId, productIds }: { agentId: number; productIds: number[] }) => {
      const res = await apiRequest("PUT", `/api/agents/${agentId}/products`, { productIds });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", variables.agentId, "products"] });
    },
  });
}

export function useActiveCarrierAccounts() {
  return useQuery({
    queryKey: ["/api/carrier-accounts", "all-active"],
    queryFn: async () => {
      const res = await fetch("/api/carrier-accounts", { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json();
      return (Array.isArray(all) ? all : []).filter((a: any) => a.isActive === 1);
    },
  });
}

export function useMagasins() {
  return useQuery({
    queryKey: ["/api/magasins"],
    queryFn: async () => {
      const res = await fetch("/api/magasins", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch magasins");
      return res.json();
    },
  });
}

export function useCreateMagasin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/magasins", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/magasins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/store"] });
    },
  });
}

export function useUpdateMagasin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; [key: string]: any }) => {
      const res = await apiRequest("PATCH", `/api/magasins/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/magasins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/store"] });
    },
  });
}

export function useDeleteMagasin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/magasins/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/magasins"] });
    },
  });
}

export function useUploadLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, logoData }: { id: number; logoData: string }) => {
      const res = await apiRequest("POST", `/api/magasins/${id}/logo`, { logoData });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/magasins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/store"] });
    },
  });
}

export function useDailyStats() {
  return useQuery({
    queryKey: ["/api/stats/daily"],
    queryFn: async () => {
      const res = await fetch("/api/stats/daily", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch daily stats");
      return res.json();
    },
  });
}

export function useTopProducts() {
  return useQuery({
    queryKey: ["/api/stats/top-products"],
    queryFn: async () => {
      const res = await fetch("/api/stats/top-products", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch top products");
      return res.json();
    },
  });
}

export function useStore() {
  return useQuery({
    queryKey: ["/api/store"],
    queryFn: async () => {
      const res = await fetch("/api/store", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch store");
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
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integration-logs"] });
    },
  });
}

export function useFilteredOrders(filters: Record<string, any>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== 'all') params.set(k, String(v));
  });
  const url = `/api/orders/filtered?${params.toString()}`;
  return useQuery({
    queryKey: ["/api/orders/filtered", filters],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch filtered orders");
      return res.json();
    },
  });
}

export function useAllOrders(filters: Record<string, any>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== 'all') params.set(k, String(v));
  });
  const url = `/api/orders/all?${params.toString()}`;
  return useQuery({
    queryKey: ["/api/orders/all", filters],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch all orders");
      return res.json();
    },
  });
}

export function useBulkAssign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderIds, agentId }: { orderIds: number[]; agentId: number }) => {
      const res = await apiRequest("POST", "/api/orders/bulk-assign", { orderIds, agentId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/all"] });
    },
  });
}

export function useBulkShip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderIds, provider, accountId }: { orderIds: number[]; provider: string; accountId?: number | null }) => {
      const res = await apiRequest("POST", "/api/orders/bulk-ship", { orderIds, provider, accountId: accountId ?? undefined });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integration-logs"] });
    },
  });
}

export function useAgentStoreSettings() {
  return useQuery({
    queryKey: ["/api/agents/store-settings"],
    queryFn: async () => {
      const res = await fetch("/api/agents/store-settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch agent store settings");
      return res.json();
    },
  });
}

export function useUpsertAgentStoreSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agentId, roleInStore, leadPercentage, allowedProductIds }: {
      agentId: number;
      roleInStore?: string;
      leadPercentage?: number;
      allowedProductIds?: number[];
    }) => {
      const res = await apiRequest("PUT", `/api/agents/${agentId}/store-settings`, { roleInStore, leadPercentage, allowedProductIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents/store-settings"] });
    },
  });
}

export function useOrderFollowUpLogs(orderId: number | undefined) {
  return useQuery({
    queryKey: ["/api/orders", orderId, "followup-logs"],
    queryFn: async () => {
      if (!orderId) return [];
      const res = await fetch(`/api/orders/${orderId}/followup-logs`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch follow-up logs");
      return res.json();
    },
    enabled: !!orderId,
  });
}

export function useCreateFollowUpLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, note }: { orderId: number; note: string }) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/followup-logs`, { note });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", variables.orderId, "followup-logs"] });
    },
  });
}
