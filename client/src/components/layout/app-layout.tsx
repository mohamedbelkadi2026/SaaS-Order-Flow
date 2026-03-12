import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  FileText, 
  Calculator, 
  Plug,
  Bell,
  Search,
  Menu,
  Sun,
  Moon,
  ChevronDown,
  Store,
  LogOut,
  UserCircle,
  ClipboardList,
  CreditCard,
  Shield,
  PlusCircle,
  Contact,
  ListOrdered,
  Target
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useActiveStore } from "@/hooks/use-active-store";

const ADMIN_NAV = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Commandes (Toutes)", href: "/orders/all", icon: ListOrdered },
  { name: "Mes Commandes", href: "/orders", icon: ShoppingCart, hasSubmenu: true },
  { name: "Nouvelle commande", href: "/orders/add", icon: PlusCircle, hasSubmenu: true, submenuKey: "nouvelle" },
  { name: "Stock", href: "/inventory", icon: Package },
  { name: "Magasins", href: "/magasins", icon: Store },
  { name: "Liste Clients", href: "/clients", icon: Contact },
  { name: "Gestion de l'\u00c9quipe", href: "/team", icon: Users },
  { name: "Gestion Media Buyers", href: "/media-buyers", icon: Target },
  { name: "Factures", href: "/invoices", icon: FileText },
  { name: "Facturation", href: "/billing", icon: CreditCard },
  { name: "Rentabilit\u00e9", href: "/profitability", icon: Calculator },
  { name: "Int\u00e9gration", href: "/integrations", icon: Plug, hasSubmenu: true },
];

const MEDIA_BUYER_NAV = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Mes Commandes", href: "/orders", icon: ShoppingCart, hasSubmenu: true },
];

const ORDER_SUB_ITEMS = [
  { name: "Nouveaux", href: "/orders" },
  { name: "Confirmés", href: "/orders/confirme" },
  { name: "Injoignables", href: "/orders/injoignable" },
  { name: "Annulés", href: "/orders/annules" },
  { name: "Boite vocale", href: "/orders/boite-vocale" },
  { name: "En cours", href: "/orders/en-cours" },
  { name: "Suivi des Colis", href: "/orders/suivi" },
  { name: "Livrées", href: "/orders/livrees" },
  { name: "Refusées", href: "/orders/refuses" },
];

const INTEGRATION_SUB_ITEMS = [
  { name: "Boutiques", href: "/integrations" },
  { name: "Sociétés de Livraison", href: "/integrations/shipping" },
  { name: "Journal", href: "/integrations/logs" },
];

const NOUVELLE_SUB_ITEMS = [
  { name: "Ajouter", href: "/orders/add" },
  { name: "Importer", href: "/orders/import" },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isDark, setIsDark] = useState(false);
  const { user, logout } = useAuth();
  const { activeStoreId, setActiveStoreId, stores, activeStore } = useActiveStore();

  useEffect(() => {
    if (isDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDark]);

  const isAgent = user?.role === 'agent';
  const isMediaBuyer = user?.role === 'media_buyer';
  const agentPerms = (user?.dashboardPermissions || {}) as Record<string, boolean>;

  const { data: agentSettingsData } = useQuery<any[]>({
    queryKey: ["/api/agents/store-settings"],
    enabled: isAgent,
  });
  const myAgentSetting = agentSettingsData?.find((s: any) => s.agentId === user?.id);
  const agentSpecialty = myAgentSetting?.roleInStore || 'confirmation';

  const baseNav = user?.isSuperAdmin
    ? [...ADMIN_NAV, { name: "Super Admin", href: "/admin", icon: Shield }]
    : ADMIN_NAV;

  const AGENT_ALLOWED_HREFS = ['/', '/orders', '/orders/add'];

  const navItems = useMemo(() => {
    if (isMediaBuyer) return MEDIA_BUYER_NAV;
    if (!isAgent) return baseNav;
    return baseNav.filter((item) => {
      if (!AGENT_ALLOWED_HREFS.includes(item.href)) return false;
      if (agentSpecialty === 'suivi' && item.name === 'Nouvelle commande') return false;
      return true;
    });
  }, [isMediaBuyer, isAgent, baseNav, agentSpecialty]);

  const visibleOrderSubItems = useMemo(() => {
    if (isMediaBuyer) return ORDER_SUB_ITEMS.filter(s => s.name !== 'Suivi des Colis');
    if (!isAgent || agentSpecialty === 'both') return ORDER_SUB_ITEMS;
    if (agentSpecialty === 'confirmation') {
      return ORDER_SUB_ITEMS.filter(s => !['Suivi des Colis', 'En cours', 'Livrées', 'Refusées'].includes(s.name));
    }
    return ORDER_SUB_ITEMS.filter(s => ['En cours', 'Suivi des Colis', 'Livrées', 'Refusées'].includes(s.name));
  }, [isAgent, agentSpecialty]);

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border w-64">
      <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg shadow-lg" style={{ background: 'hsl(45 67% 52%)', color: '#1e1b4b' }}>
          T
        </div>
        <span className="font-display font-bold text-lg text-sidebar-foreground tracking-wide">TajerGrow</span>
      </div>
      
      <div className="px-4 pb-2 pt-3">
        <div className="text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-widest mb-2 px-2">Navigation</div>
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isNouvelleMenu = item.name === "Nouvelle commande";
          const isActive = location === item.href ||
            (item.name === "Int\u00e9gration" && location.startsWith("/integrations")) ||
            (item.name === "Mes Commandes" && location.startsWith("/orders") && location !== "/orders/all" && location !== "/orders/add" && location !== "/orders/import") ||
            (item.name === "Commandes (Toutes)" && location === "/orders/all") ||
            (isNouvelleMenu && (location === "/orders/add" || location === "/orders/import"));
          const isOrdersMenu = item.name === "Mes Commandes";
          const isIntegrationMenu = item.name === "Int\u00e9gration";

          return (
            <div key={item.name} className="space-y-0.5">
              <Link href={item.href} className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                isActive
                  ? "text-sidebar-foreground bg-sidebar-accent"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}>
                <item.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/40")} />
                {item.name}
                {item.hasSubmenu && <ChevronDown className="w-3 h-3 ml-auto opacity-50" />}
              </Link>
              
              {isOrdersMenu && (
                <div className="ml-7 pl-3 border-l border-sidebar-border/40 space-y-0.5 mt-0.5">
                  {visibleOrderSubItems.map((sub) => (
                    <Link key={sub.name} href={sub.href} className={cn(
                      "block px-3 py-1.5 text-xs rounded-lg transition-colors font-medium",
                      location === sub.href
                        ? "text-sidebar-primary"
                        : "text-sidebar-foreground/45 hover:text-sidebar-foreground"
                    )}>
                      {sub.name}
                    </Link>
                  ))}
                </div>
              )}

              {isIntegrationMenu && (
                <div className="ml-7 pl-3 border-l border-sidebar-border/40 space-y-0.5 mt-0.5">
                  {INTEGRATION_SUB_ITEMS.map((sub) => (
                    <Link key={sub.name} href={sub.href} className={cn(
                      "block px-3 py-1.5 text-xs rounded-lg transition-colors font-medium",
                      location === sub.href || (sub.name === "Boutiques" && location === "/integrations")
                        ? "text-sidebar-primary"
                        : "text-sidebar-foreground/45 hover:text-sidebar-foreground"
                    )}>
                      {sub.name}
                    </Link>
                  ))}
                </div>
              )}

              {isNouvelleMenu && (
                <div className="ml-7 pl-3 border-l border-sidebar-border/40 space-y-0.5 mt-0.5">
                  {NOUVELLE_SUB_ITEMS.map((sub) => (
                    <Link key={sub.name} href={sub.href} className={cn(
                      "block px-3 py-1.5 text-xs rounded-lg transition-colors font-medium",
                      location === sub.href
                        ? "text-sidebar-primary"
                        : "text-sidebar-foreground/45 hover:text-sidebar-foreground"
                    )}>
                      {sub.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 mt-auto border-t border-sidebar-border">
        <div className="mb-3 px-3 py-2 rounded-xl bg-sidebar-accent/50">
          <p className="text-xs font-bold text-sidebar-foreground/80 truncate">{user?.username}</p>
          <p className="text-[10px] text-sidebar-foreground/50 capitalize">{user?.role === 'owner' ? 'Administrateur' : user?.role === 'media_buyer' ? 'Media Buyer' : 'Agent'}</p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm font-semibold text-sidebar-foreground/60 hover:bg-red-500/15 hover:text-red-400 transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex w-full font-sans">
      {/* Desktop sidebar — sticky full height */}
      <div className="hidden lg:flex h-screen sticky top-0 shrink-0 z-20">
        <SidebarContent />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="h-14 bg-card/90 backdrop-blur-md border-b border-border sticky top-0 z-10 flex items-center justify-between px-3 lg:px-6 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile hamburger — opens full sliding drawer */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden shrink-0 h-9 w-9" data-testid="button-mobile-menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[260px] max-w-[80vw] border-none">
                <SidebarContent />
              </SheetContent>
            </Sheet>

            <div className="relative hidden md:block w-72 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Rechercher commandes, clients..."
                className="pl-9 h-9 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:ring-primary/20 rounded-xl transition-all text-sm"
                data-testid="input-search"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {stores.length > 1 && (
              <Select value={String(activeStoreId || '')} onValueChange={(val) => setActiveStoreId(Number(val))}>
                <SelectTrigger className="w-[130px] h-8 text-xs rounded-xl border-border/50" data-testid="select-store-switcher">
                  <Store className="w-3.5 h-3.5 mr-1 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Magasin" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)} data-testid={`option-store-${s.id}`}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button variant="ghost" size="icon" onClick={() => setIsDark(!isDark)} className="rounded-full h-8 w-8" data-testid="button-theme">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            <Button variant="ghost" size="icon" className="relative rounded-full h-8 w-8" data-testid="button-notifications">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-destructive rounded-full border-2 border-background"></span>
            </Button>

            <div className="h-6 w-px bg-border mx-0.5"></div>

            <div className="flex items-center gap-2 px-1 rounded-xl text-left">
              <Avatar className="w-8 h-8 border-2 border-primary/20">
                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.username || 'U'}`} />
                <AvatarFallback className="text-xs font-bold">{user?.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <p className="text-xs font-bold leading-none" data-testid="text-username">{user?.username || 'User'}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{user?.role === 'owner' ? 'Admin' : user?.role === 'media_buyer' ? 'Media Buyer' : 'Agent'}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content — full width, no max-w cap */}
        <main className="flex-1 p-3 sm:p-5 lg:p-6 overflow-x-hidden overflow-y-auto">
          <div className="w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
