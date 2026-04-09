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
import { useEffect, Suspense } from "react";

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

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

// Strict helper — only integer 1 or boolean true counts as verified.
// This prevents null / undefined / 0 from sneaking through as "verified".
function emailIsVerified(user: any): boolean {
  return user?.isEmailVerified === 1 || user?.isEmailVerified === true;
}

function ProtectedRoutes() {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();
  useOrderStatusSSE();

  // Unverified owner = owner whose email is NOT strictly verified (=== 1 | true).
  // Super-admins are always considered verified regardless of the flag.
  const unverifiedOwner = !!(
    user && user.role === "owner" && !user.isSuperAdmin && !emailIsVerified(user)
  );

  // Strict lock: unverified owners may ONLY be on /verify-email.
  const needsVerification = unverifiedOwner && location !== "/verify-email";

  // All redirects via useEffect — NEVER fire while isLoading to avoid loops.
  useEffect(() => {
    if (isLoading) return;
    if (user && ["/auth", "/login", "/register"].includes(location)) {
      navigate(unverifiedOwner ? "/verify-email" : "/");
    }
  }, [isLoading, user, location, unverifiedOwner]);

  // Redirect unverified owners away from all private routes.
  useEffect(() => {
    if (isLoading) return;
    if (needsVerification) navigate("/verify-email");
  }, [isLoading, needsVerification]);

  // Redirect verified users away from /verify-email (they are already done).
  useEffect(() => {
    if (isLoading) return;
    if (user && location === "/verify-email" && !unverifiedOwner) navigate("/");
  }, [isLoading, user, location, unverifiedOwner]);

  // Show spinner while user session is loading — no redirect logic runs during this.
  if (isLoading) return <FullPageSpinner />;

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!user) {
    if (location === "/auth" || location === "/login") return <AuthPage initialTab="login" />;
    if (location === "/register") return <AuthPage initialTab="register" />;
    if (location === "/verify-email") return <AuthPage initialTab="login" />;
    return <LandingPage />;
  }

  // ── Logged in — handle special pages ─────────────────────────────────────
  // Spinner (instead of null) while useEffect fires its redirect
  if (location === "/auth" || location === "/login" || location === "/register") return <FullPageSpinner />;

  // /verify-email: show the page ONLY for unverified owners; everyone else gets a spinner
  // while the useEffect above redirects them to /.
  if (location === "/verify-email") {
    if (unverifiedOwner) return <VerifyEmailPage />;
    return <FullPageSpinner />;
  }

  // Spinner while the needsVerification useEffect fires the redirect
  if (needsVerification) return <FullPageSpinner />;

  // ── Verified user → full app ──────────────────────────────────────────────
  return (
    <ActiveStoreProvider>
      <AppLayout>
        <AgentGuard>
          <Suspense fallback={<FullPageSpinner />}>
            <Switch key={location}>
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
          </Suspense>
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
