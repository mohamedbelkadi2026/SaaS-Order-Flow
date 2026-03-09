import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ActiveStoreProvider } from "@/hooks/use-active-store";
import { Loader2 } from "lucide-react";

import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import Orders from "@/pages/orders";
import NewOrder from "@/pages/new-order";
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

function ProtectedRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <ActiveStoreProvider>
      <AppLayout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/orders/all" component={AllOrders} />
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
          <Route component={NotFound} />
        </Switch>
      </AppLayout>
    </ActiveStoreProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <ProtectedRoutes />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
