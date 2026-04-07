import { Switch, Route, useLocation, Link } from "wouter";
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
import ProfitAnalyzer from "@/pages/profit-analyzer";
import CheckoutPage from "@/pages/checkout";
import AutomationPage from "@/pages/automation";
import VerifyEmailPage from "@/pages/verify-email";
import LpBuilder from "@/pages/lp-builder";
import LpView from "@/pages/lp-view";

// ── Purely public paths — always rendered, no auth/verification check ─────────
// Any path listed here is served directly from AppRouter before any auth logic.
const PUBLIC_PATHS: Record<string, React.ComponentType> = {
  "/partenaires-livraison": ShippingPartnersPublicPage,
  "/tarifs": TarifsPage,
  "/faq": FaqPage,
  "/terms": TermsPage,
  "/privacy": PrivacyPage,
  "/blog": BlogPage,
  "/temoignages": TemoignagesPage,
};

// ── Private routes that trigger the email-verification guard ──────────────────
// "/" (dashboard) is also private — unverified users see LandingPage there instead.
const PRIVATE_PREFIXES = [
  "/orders", "/inventory", "/team", "/clients", "/magasins",
  "/invoices", "/billing", "/profitability", "/integrations",
  "/admin", "/media-buyers", "/mes-depenses", "/publicites",
  "/profile", "/calculator", "/checkout", "/automation", "/profit-analyzer",
  "/lp-builder",
];

function isPrivatePath(path: string) {
  return PRIVATE_PREFIXES.some(p => path === p || path.startsWith(p + "/"));
}

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

  const isAgentBlocked = user?.role === "agent" && AGENT_BLOCKED_PATHS.some(p => location === p || location.startsWith(p + "/"));
  const isMediaBuyerBlocked = user?.role === "media_buyer" && MEDIA_BUYER_BLOCKED_PATHS.some(p => location === p || location.startsWith(p + "/"));
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

// Only open the SSE connection for verified users to avoid noise in logs
function useOrderStatusSSE() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || !user.isEmailVerified) return;
    const es = new EventSource("/api/automation/events", { withCredentials: true });
    const invalidateOrders = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/filtered"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    };
    const handleStatusUpdated = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const { orderId, status } = data;
        if (!orderId || !status) return;
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

  // Unverified owner = logged-in owner who hasn't confirmed their email yet.
  const unverifiedOwner = !!(
    user && user.role === "owner" && !user.isSuperAdmin && !user.isEmailVerified
  );
  // Strict lock: unverified owners may ONLY be on /verify-email.
  // Every other route — including "/" — sends them back.
  const needsVerification = unverifiedOwner && location !== "/verify-email";

  // All redirects via useEffect — never navigate during render
  useEffect(() => {
    if (!isLoading && user && ["/auth", "/login", "/register"].includes(location)) {
      navigate(unverifiedOwner ? "/verify-email" : "/");
    }
  }, [isLoading, user, location, unverifiedOwner]);

  useEffect(() => {
    if (needsVerification) {
      console.log("User registered, redirecting to verification page...");
      navigate("/verify-email");
    }
  }, [needsVerification]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!user) {
    if (location === "/auth" || location === "/login") return <AuthPage initialTab="login" />;
    if (location === "/register") return <AuthPage initialTab="register" />;
    // /verify-email requires being logged in — redirect guests to login instead
    if (location === "/verify-email") return <AuthPage initialTab="login" />;
    return <LandingPage />;
  }

  // ── Logged in — handle special pages first ────────────────────────────────
  if (location === "/auth" || location === "/login" || location === "/register") return null; // useEffect handles redirect
  // Unverified owners: ONLY the verify page is allowed — useEffect redirects everything else
  if (location === "/verify-email") return <VerifyEmailPage />;
  if (needsVerification) return null; // briefly null while useEffect fires the redirect

  // ── Verified user → full app ──────────────────────────────────────────────
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
            <Route path="/profit-analyzer" component={ProfitAnalyzer} />
            <Route path="/lp-builder" component={LpBuilder} />
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

  // ── 1. Always-public pages — no auth check, no verification check ──────────
  const PublicPage = PUBLIC_PATHS[location];
  if (PublicPage) return <PublicPage />;

  // ── 1b. Public landing pages by slug (/lp/:slug) ───────────────────────────
  if (location.startsWith("/lp/") && location.length > 4) return <LpView />;

  // ── 2. Super-admin panel ───────────────────────────────────────────────────
  if (location === "/super-admin") {
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

  // ── 3. Everything else — auth/verification aware ───────────────────────────
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
