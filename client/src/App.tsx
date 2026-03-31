import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ActiveStoreProvider } from "@/hooks/use-active-store";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

import AuthPage from "@/pages/auth-page";
import SuperAdminPage from "@/pages/super-admin";
import LandingPage from "@/pages/landing";
import ShippingPartnersPublicPage from "@/pages/shipping-partners-public";
import TarifsPage from "@/pages/tarifs";
import FaqPage from "@/pages/faq";
import TermsPage from "@/pages/terms";
import PrivacyPage from "@/pages/privacy";
import BlogPage from "@/pages/blog";
import TemoignagesPage from "@/pages/temoignages";
import Dashboard from "@/pages/dashboard";
import Orders from "@/pages/orders";
import NewOrder from "@/pages/new-order";
import NewOrderAdd from "@/pages/new-order-add";
import NewOrderImport from "@/pages/new-order-import";
import Profitability from "@/pages/profitability";
import Inventory from "@/pages/inventory";
import Team from "@/pages/team";
import Clients from "@/pages/clients";
import Billing from "@/pages/billing";
import Admin from "@/pages/admin";
import Integrations from "@/pages/integrations";
import ShippingIntegrations from "@/pages/shipping-integrations";
import IntegrationLogs from "@/pages/integration-logs";
import Invoices from "@/pages/invoices";
import Magasins from "@/pages/magasins";
import AllOrders from "@/pages/all-orders";
import MediaBuyersPage from "@/pages/media-buyers";
import MesDepenses from "@/pages/mes-depenses";
import Publicites from "@/pages/publicites";
import Profile from "@/pages/profile";
import Calculator from "@/pages/calculator";
import CheckoutPage from "@/pages/checkout";
import AutomationPage from "@/pages/automation";
import VerifyEmailPage from "@/pages/verify-email";

const AGENT_BLOCKED_PATHS = [
  "/inventory", "/magasins", "/team", "/clients",
  "/invoices", "/billing", "/profitability",
  "/integrations", "/integrations/shipping", "/integrations/logs",
  "/orders/all", "/admin", "/calculator", "/automation",
];

const MEDIA_BUYER_BLOCKED_PATHS = [
  "/inventory", "/magasins", "/team", "/clients",
  "/invoices", "/billing", "/profitability",
  "/integrations", "/integrations/shipping", "/integrations/logs",
  "/orders/all", "/admin", "/orders/add", "/orders/import", "/orders/new",
  "/media-buyers",
];

function AgentGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();

  const isAgentBlocked = user?.role === 'agent' && AGENT_BLOCKED_PATHS.some(p => location === p || location.startsWith(p + "/"));
  const isMediaBuyerBlocked = user?.role === 'media_buyer' && MEDIA_BUYER_BLOCKED_PATHS.some(p => location === p || location.startsWith(p + "/"));
  const isBlocked = isAgentBlocked || isMediaBuyerBlocked;

  useEffect(() => {
    if (isBlocked) {
      toast({ title: "Accès refusé", description: "Vous n'avez pas accès à cette section.", variant: "destructive" });
      navigate("/");
    }
  }, [isBlocked]);

  if (isBlocked) return null;
  return <>{children}</>;
}

function useOrderStatusSSE() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const es = new EventSource("/api/automation/events", { withCredentials: true });
    const invalidateOrders = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    };
    // Instant optimistic cache update — patch the specific order without waiting for refetch
    const handleStatusUpdated = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const { orderId, status } = data;
        if (!orderId || !status) return;
        // Patch all cached order lists that contain this order
        const patchOrders = (list: any[]) =>
          list.map((o: any) => o.id === orderId ? { ...o, status } : o);
        queryClient.setQueriesData({ queryKey: ["/api/orders"] }, (old: any) =>
          Array.isArray(old) ? patchOrders(old) : old);
        queryClient.setQueriesData({ queryKey: ["/api/orders/filtered"] }, (old: any) => {
          if (!old) return old;
          if (Array.isArray(old)) return patchOrders(old);
          if (old.orders && Array.isArray(old.orders)) return { ...old, orders: patchOrders(old.orders) };
          return old;
        });
        // Also schedule a background refetch so stats + totals are eventually consistent
        setTimeout(invalidateOrders, 2000);
      } catch { invalidateOrders(); }
    };
    es.addEventListener("ORDER_STATUS_UPDATED", handleStatusUpdated);
    es.addEventListener("confirmed", invalidateOrders);
    es.addEventListener("cancelled", invalidateOrders);
    es.addEventListener("post_confirm_cancel", invalidateOrders);
    return () => es.close();
  }, [user]);
}

function ProtectedRoutes() {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();
  useOrderStatusSSE();

  // Compute derived state before any early returns (Rules of Hooks)
  const needsVerification = !!(
    user &&
    user.role === "owner" &&
    !user.isSuperAdmin &&
    !user.isEmailVerified &&
    location !== "/verify-email"
  );
  const isAuthPage = location === "/auth";

  // All redirects via useEffect — never call navigate() during render
  useEffect(() => {
    if (!isLoading && user && isAuthPage) navigate("/");
  }, [isLoading, user, isAuthPage]);

  useEffect(() => {
    if (needsVerification) navigate("/verify-email");
  }, [needsVerification]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    if (isAuthPage) return <AuthPage />;
    if (location === "/verify-email") return <VerifyEmailPage />;
    return <LandingPage />;
  }

  if (isAuthPage) return null;

  // Show verify page regardless of verification state when on that route
  if (location === "/verify-email") return <VerifyEmailPage />;
  if (needsVerification) return null;

  return (
    <ActiveStoreProvider>
      <AppLayout>
        <AgentGuard>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/orders/all" component={AllOrders} />
            <Route path="/orders/add" component={NewOrderAdd} />
            <Route path="/orders/import" component={NewOrderImport} />
            <Route path="/orders/new" component={NewOrder} />
            <Route path="/orders" component={Orders} />
            <Route path="/orders/:filter" component={Orders} />
            <Route path="/inventory" component={Inventory} />
            <Route path="/team" component={Team} />
            <Route path="/clients" component={Clients} />
            <Route path="/magasins" component={Magasins} />
            <Route path="/invoices" component={Invoices} />
            <Route path="/billing" component={Billing} />
            <Route path="/profitability" component={Profitability} />
            <Route path="/integrations" component={Integrations} />
            <Route path="/integrations/shipping" component={ShippingIntegrations} />
            <Route path="/integrations/logs" component={IntegrationLogs} />
            <Route path="/admin" component={Admin} />
            <Route path="/media-buyers" component={MediaBuyersPage} />
            <Route path="/mes-depenses" component={MesDepenses} />
            <Route path="/publicites" component={Publicites} />
            <Route path="/profile" component={Profile} />
            <Route path="/calculator" component={Calculator} />
            <Route path="/checkout" component={CheckoutPage} />
            <Route path="/automation" component={AutomationPage} />
            <Route component={NotFound} />
          </Switch>
        </AgentGuard>
      </AppLayout>
    </ActiveStoreProvider>
  );
}

function AppRouter() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (location === "/partenaires-livraison") return <ShippingPartnersPublicPage />;
  if (location === "/tarifs") return <TarifsPage />;
  if (location === "/faq") return <FaqPage />;
  if (location === "/terms") return <TermsPage />;
  if (location === "/privacy") return <PrivacyPage />;
  if (location === "/blog") return <BlogPage />;
  if (location === "/temoignages") return <TemoignagesPage />;

  if (location === "/super-admin" || location === "/admin") {
    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f1e38" }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#C5A059" }} />
        </div>
      );
    }
    if (!user) return <AuthPage />;
    return <SuperAdminPage />;
  }

  return <ProtectedRoutes />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <AppRouter />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
