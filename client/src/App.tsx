import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/app-layout";

// Pages
import Dashboard from "@/pages/dashboard";
import Orders from "@/pages/orders";
import Profitability from "@/pages/profitability";
import Inventory from "@/pages/inventory";
import Team from "@/pages/team";
import Integrations from "@/pages/integrations";
import ShippingIntegrations from "@/pages/shipping-integrations";
import Invoices from "@/pages/invoices";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard}/>
        <Route path="/orders" component={Orders}/>
        <Route path="/inventory" component={Inventory}/>
        <Route path="/team" component={Team}/>
        <Route path="/invoices" component={Invoices}/>
        <Route path="/profitability" component={Profitability}/>
        <Route path="/integrations" component={Integrations}/>
        <Route path="/integrations/shipping" component={ShippingIntegrations}/>
        
        {/* Fallback to 404 */}
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
