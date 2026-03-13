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
  ChevronUp,
  Store,
  LogOut,
  CreditCard,
  Shield,
  Upload,
  Contact,
  ListOrdered,
  Target,
  X,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useActiveStore } from "@/hooks/use-active-store";

/* ─── Nav definitions ─────────────────────────────────────────── */
const ADMIN_NAV = [
  { name: "Dashboard",              href: "/",              icon: LayoutDashboard },
  { name: "Mes Commandes",          href: "/orders",        icon: ShoppingCart,   hasSubmenu: true  },
  { name: "Commandes (Toutes)",     href: "/orders/all",    icon: ListOrdered     },
  { name: "Nouvelle commande",      href: "/orders/add",    icon: Upload,         hasSubmenu: true, submenuKey: "nouvelle" },
  { name: "Stock",                  href: "/inventory",     icon: Package         },
  { name: "Magasins",               href: "/magasins",      icon: Store           },
  { name: "List Client",            href: "/clients",       icon: Contact         },
  { name: "Gestion de l'Équipe",    href: "/team",          icon: Users           },
  { name: "Gestion Media Buyers",   href: "/media-buyers",  icon: Target          },
  { name: "Factures",               href: "/invoices",      icon: FileText        },
  { name: "Facturation",            href: "/billing",       icon: CreditCard      },
  { name: "Advanced Profitability", href: "/profitability", icon: Calculator      },
  { name: "Publicités",             href: "/publicites",    icon: Receipt         },
  { name: "Integration",            href: "/integrations",  icon: Plug,           hasSubmenu: true  },
] as const;

const MEDIA_BUYER_NAV = [
  { name: "Dashboard",       href: "/",            icon: LayoutDashboard },
  { name: "Mes Commandes",   href: "/orders",      icon: ShoppingCart, hasSubmenu: true },
  { name: "Publicités",      href: "/publicites",  icon: Receipt },
] as const;

const ORDER_SUB_ITEMS = [
  { name: "Nouveaux",       href: "/orders",             badge: true },
  { name: "Confirmés",      href: "/orders/confirme" },
  { name: "Injoignables",   href: "/orders/injoignable" },
  { name: "Annulés",        href: "/orders/annules" },
  { name: "Boite vocale",   href: "/orders/boite-vocale" },
  { name: "En cours",       href: "/orders/en-cours" },
  { name: "Suivi des Colis",href: "/orders/suivi" },
  { name: "Livrées",        href: "/orders/livrees" },
  { name: "Refusées",       href: "/orders/refuses" },
];

const INTEGRATION_SUB_ITEMS = [
  { name: "Boutiques",              href: "/integrations" },
  { name: "Sociétés de Livraison",  href: "/integrations/shipping" },
  { name: "Journal",                href: "/integrations/logs" },
];

const NOUVELLE_SUB_ITEMS = [
  { name: "Ajouter",   href: "/orders/add" },
  { name: "Importer",  href: "/orders/import" },
];

/* ─── Main layout ──────────────────────────────────────────────── */
export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isDark, setIsDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const { activeStoreId, setActiveStoreId, stores } = useActiveStore();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  /* Close mobile drawer on route change */
  useEffect(() => { setMobileOpen(false); }, [location]);

  const isAgent = user?.role === 'agent';
  const isMediaBuyer = user?.role === 'media_buyer';

  const { data: agentSettingsData } = useQuery<any[]>({
    queryKey: ["/api/agents/store-settings"],
    enabled: isAgent,
  });
  const myAgentSetting = agentSettingsData?.find((s: any) => s.agentId === user?.id);
  const agentSpecialty = myAgentSetting?.roleInStore || 'confirmation';

  /* New-orders count for badge */
  const { data: ordersStats } = useQuery<any>({
    queryKey: ['/api/stats/filtered'],
    enabled: !isMediaBuyer,
  });
  const newOrdersCount: number = ordersStats?.nouveau ?? 0;

  const baseNav = user?.isSuperAdmin
    ? [...ADMIN_NAV, { name: "Super Admin", href: "/admin", icon: Shield }]
    : [...ADMIN_NAV];

  const AGENT_ALLOWED_HREFS = ['/', '/orders', '/orders/add'];

  const navItems = useMemo(() => {
    if (isMediaBuyer) return [...MEDIA_BUYER_NAV];
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
  }, [isAgent, agentSpecialty, isMediaBuyer]);

  /* ── Sidebar JSX ──────────────────────────────────────────────── */
  const SidebarContent = ({ onClose }: { onClose?: () => void }) => (
    <div
      className="flex flex-col h-full w-64 overflow-hidden"
      style={{ background: 'hsl(220 72% 38%)', color: '#fff' }}
    >
      {/* Logo bar */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-base shadow"
            style={{ background: '#fff', color: 'hsl(220 72% 38%)' }}
          >
            T
          </div>
          <span className="font-display font-extrabold text-base tracking-wide text-white">TajerGrow</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded-lg opacity-60 hover:opacity-100 transition-opacity lg:hidden">
            <X className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* MENU label */}
      <div className="px-5 pt-4 pb-1 shrink-0">
        <span className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>MENU</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pb-3 overflow-y-auto space-y-0.5">
        {navItems.map((item) => {
          const isOrdersMenu = item.name === "Mes Commandes";
          const isIntegrationMenu = item.name === "Integration";
          const isNouvelleMenu = item.name === "Nouvelle commande";

          const isActive =
            (item.name === "Dashboard" && location === "/") ||
            (isOrdersMenu && location.startsWith("/orders") && location !== "/orders/all" && location !== "/orders/add" && location !== "/orders/import") ||
            (item.name === "Commandes (Toutes)" && location === "/orders/all") ||
            (isNouvelleMenu && (location === "/orders/add" || location === "/orders/import")) ||
            (isIntegrationMenu && location.startsWith("/integrations")) ||
            (!isOrdersMenu && !isIntegrationMenu && !isNouvelleMenu && item.name !== "Dashboard" && location === item.href);

          const hasSubmenu = !!(item as any).hasSubmenu;

          return (
            <div key={item.name}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 group",
                  isActive
                    ? "text-white"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                )}
                style={isActive ? { background: 'rgba(255,255,255,0.18)' } : {}}
              >
                <item.icon
                  className="w-[18px] h-[18px] shrink-0 opacity-90"
                />
                <span className="flex-1 leading-tight">{item.name}</span>
                {hasSubmenu && (
                  isActive
                    ? <ChevronUp className="w-3.5 h-3.5 opacity-70 shrink-0" />
                    : <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
                )}
              </Link>

              {/* Orders submenu */}
              {isOrdersMenu && (
                <div className="mt-0.5 mb-1 ml-4 space-y-0.5">
                  {visibleOrderSubItems.map((sub) => {
                    const subActive = location === sub.href;
                    return (
                      <Link
                        key={sub.name}
                        href={sub.href}
                        className={cn(
                          "flex items-center justify-between px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-100",
                          subActive
                            ? "text-white font-bold"
                            : "text-white/60 hover:text-white hover:bg-white/10"
                        )}
                        style={subActive ? { background: 'rgba(255,255,255,0.15)' } : {}}
                      >
                        <span>{sub.name}</span>
                        {sub.name === "Nouveaux" && newOrdersCount > 0 && (
                          <span
                            className="ml-2 shrink-0 flex items-center justify-center rounded-full text-[10px] font-extrabold leading-none px-1.5 py-0.5 min-w-[20px]"
                            style={{ background: '#ef4444', color: '#fff' }}
                          >
                            {newOrdersCount > 99 ? '99+' : newOrdersCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Integration submenu */}
              {isIntegrationMenu && isActive && (
                <div className="mt-0.5 mb-1 ml-4 space-y-0.5">
                  {INTEGRATION_SUB_ITEMS.map((sub) => {
                    const subActive = location === sub.href || (sub.name === "Boutiques" && location === "/integrations");
                    return (
                      <Link
                        key={sub.name}
                        href={sub.href}
                        className={cn(
                          "block px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-100",
                          subActive ? "text-white font-bold" : "text-white/60 hover:text-white hover:bg-white/10"
                        )}
                        style={subActive ? { background: 'rgba(255,255,255,0.15)' } : {}}
                      >
                        {sub.name}
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Nouvelle commande submenu */}
              {isNouvelleMenu && isActive && (
                <div className="mt-0.5 mb-1 ml-4 space-y-0.5">
                  {NOUVELLE_SUB_ITEMS.map((sub) => {
                    const subActive = location === sub.href;
                    return (
                      <Link
                        key={sub.name}
                        href={sub.href}
                        className={cn(
                          "block px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-100",
                          subActive ? "text-white font-bold" : "text-white/60 hover:text-white hover:bg-white/10"
                        )}
                        style={subActive ? { background: 'rgba(255,255,255,0.15)' } : {}}
                      >
                        {sub.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer / user info */}
      <div className="shrink-0 px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl mb-1" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.username || 'U'}&backgroundColor=ffffff&textColor=1a3a8f`} />
            <AvatarFallback className="text-xs font-bold text-primary bg-white">{user?.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate leading-tight">{user?.username}</p>
            <p className="text-[10px] text-white/50">
              {user?.role === 'owner' ? 'Administrateur' : user?.role === 'media_buyer' ? 'Media Buyer' : 'Agent'}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2.5 px-3 py-2 w-full rounded-xl text-xs font-semibold text-white/50 hover:text-white hover:bg-white/10 transition-colors mt-1"
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </div>
  );

  /* ── Full layout ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background flex w-full font-sans">

      {/* Desktop sidebar — sticky */}
      <aside className="hidden lg:flex h-screen sticky top-0 shrink-0 z-30 shadow-xl">
        <SidebarContent />
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <aside className="relative z-50 h-full shadow-2xl" style={{ width: 260 }}>
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top header */}
        <header className="h-14 bg-card/95 backdrop-blur-md border-b border-border sticky top-0 z-20 flex items-center justify-between px-3 lg:px-5 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Hamburger — mobile only */}
            <button
              className="lg:hidden shrink-0 p-2 rounded-xl hover:bg-muted transition-colors"
              onClick={() => setMobileOpen(true)}
              data-testid="button-mobile-menu"
            >
              <Menu className="w-5 h-5 text-foreground" />
            </button>

            <div className="relative hidden md:block w-64 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Rechercher commandes, clients..."
                className="pl-9 h-9 bg-muted/50 border-transparent focus-visible:bg-background rounded-xl text-sm"
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
              {newOrdersCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-background" />
              )}
            </Button>

            <div className="h-6 w-px bg-border mx-0.5" />

            <div className="flex items-center gap-2 px-1">
              <Avatar className="w-8 h-8 border-2 border-primary/20">
                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.username || 'U'}`} />
                <AvatarFallback className="text-xs font-bold">{user?.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <p className="text-xs font-bold leading-none" data-testid="text-username">{user?.username || 'User'}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {user?.role === 'owner' ? 'Admin' : user?.role === 'media_buyer' ? 'Media Buyer' : 'Agent'}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden overflow-y-auto">
          <div className="w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
