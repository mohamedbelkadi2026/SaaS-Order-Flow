import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  User,
  Power,
  Youtube,
  HelpCircle,
  Clock,
  CheckCircle2,
  Package2,
  PlayCircle,
  PieChart,
  AlertTriangle,
  Zap,
  TrendingUp,
  MessageCircle,
  Rocket,
  CalendarX,
  Bot,
  BarChart3,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useActiveStore } from "@/hooks/use-active-store";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/use-store-data";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  { name: "Facturation",            href: "/billing",       icon: CreditCard      },
  { name: "Advanced Profitability", href: "/profitability", icon: Calculator      },
  { name: "Publicités",             href: "/publicites",    icon: Receipt         },
  { name: "Calculateur de Marge",   href: "/calculator",    icon: PieChart        },
  { name: "Profit Analyzer Pro",    href: "/profit-analyzer", icon: BarChart3     },
  { name: "LP Builder",             href: "/lp-builder",    icon: Zap             },
  { name: "Automation & AI",        href: "/automation",    icon: Bot             },
  { name: "Integration",            href: "/integrations",  icon: Plug,           hasSubmenu: true  },
] as const;

const MEDIA_BUYER_NAV = [
  { name: "Dashboard",              href: "/",            icon: LayoutDashboard },
  { name: "Mes Commandes",          href: "/orders",      icon: ShoppingCart, hasSubmenu: true },
  { name: "Publicités",             href: "/publicites",  icon: Receipt },
  { name: "Calculateur de Marge",   href: "/calculator",  icon: PieChart },
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

/* ─── i18n key maps ───────────────────────────────────────────── */
const NAV_KEYS: Record<string, string> = {
  "Dashboard":              "nav.dashboard",
  "Mes Commandes":          "nav.orders",
  "Commandes (Toutes)":     "nav.allOrders",
  "Nouvelle commande":      "nav.newOrder",
  "Stock":                  "nav.inventory",
  "Magasins":               "nav.stores",
  "List Client":            "nav.clients",
  "Gestion de l'Équipe":    "nav.team",
  "Gestion Media Buyers":   "nav.mediaBuyers",
  "Factures":               "nav.invoices",
  "Facturation":            "nav.billing",
  "Advanced Profitability": "nav.profitability",
  "Publicités":             "nav.ads",
  "Calculateur de Marge":   "nav.calculator",
  "Profit Analyzer Pro":    "nav.profitAnalyzer",
  "Integration":            "nav.integrations",
  "Super Admin":            "nav.superAdmin",
  "Mes Dépenses":           "nav.expenses",
};
const ORDER_SUB_KEYS: Record<string, string> = {
  "Nouveaux":       "orderSub.new",
  "Confirmés":      "orderSub.confirmed",
  "Injoignables":   "orderSub.unreachable",
  "Annulés":        "orderSub.cancelled",
  "Boite vocale":   "orderSub.voicemail",
  "En cours":       "orderSub.inProgress",
  "Suivi des Colis":"orderSub.tracking",
  "Livrées":        "orderSub.delivered",
  "Refusées":       "orderSub.refused",
};
const INTEGRATION_SUB_KEYS: Record<string, string> = {
  "Boutiques":             "integrationSub.stores",
  "Sociétés de Livraison": "integrationSub.shipping",
  "Journal":               "integrationSub.logs",
};
const NOUVELLE_SUB_KEYS: Record<string, string> = {
  "Ajouter":  "newOrderSub.add",
  "Importer": "newOrderSub.import",
};

const LANG_OPTIONS = [
  { code: "fr" as const, label: "FR", flag: "🇫🇷", full: "Français" },
  { code: "ar" as const, label: "AR", flag: "🇲🇦", full: "العربية" },
  { code: "en" as const, label: "EN", flag: "🇬🇧", full: "English" },
];

/* ─── Main layout ──────────────────────────────────────────────── */
export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [isDark, setIsDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [integrationOpen, setIntegrationOpen] = useState(() => location.startsWith("/integrations"));
  const langMenuRef = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation();

  /* RTL support — auto-flip layout when Arabic is selected */
  useEffect(() => {
    const isRtl = i18n.language === "ar";
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = i18n.language;
    document.documentElement.classList.toggle("rtl", isRtl);
  }, [i18n.language]);
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { activeStoreId, setActiveStoreId, stores } = useActiveStore();
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  /* Close mobile drawer on route change */
  useEffect(() => { setMobileOpen(false); }, [location]);

  /* Auto-open integration menu when on integration pages */
  useEffect(() => {
    if (location.startsWith("/integrations")) setIntegrationOpen(true);
  }, [location]);

  /* Close dropdowns when route changes */
  useEffect(() => {
    setUserDropdownOpen(false);
    setNotifPanelOpen(false);
  }, [location]);

  /* Click-outside to close dropdowns */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node)) {
        setNotifPanelOpen(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isAgent = user?.role === 'agent';
  const isOwner = user?.role === 'owner';

  const { data: subscription } = useSubscription();
  const isTrial = subscription?.plan === 'trial';
  const isBlocked = subscription?.isBlocked === 1 || subscription?.isBlocked === true;
  const isExpired = (subscription as any)?.isExpired === true;
  const paywallReason = ((subscription as any)?.reason ?? (isExpired ? 'expired' : isBlocked ? 'limit' : null)) as 'expired' | 'limit' | null;
  const showPaywall = (isBlocked || isExpired) && !user?.isSuperAdmin;
  const trialCurrent = subscription?.current ?? subscription?.currentMonthOrders ?? 0;
  const trialLimit = isTrial ? 60 : (subscription?.limit ?? subscription?.monthlyLimit ?? 1500);
  const trialPercent = Math.min(100, Math.round((trialCurrent / trialLimit) * 100));
  const trialRemaining = Math.max(0, trialLimit - trialCurrent);
  const daysUntilExpiry = (subscription as any)?.daysUntilExpiry ?? null;
  const isExpiringSoon = !isTrial && daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 5;

  const stopImpersonationMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/stop-impersonation", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.clear();
      window.location.href = "/super-admin";
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de revenir au compte Super Admin", variant: "destructive" }),
  });

  useEffect(() => {
    if (isTrial && !isBlocked && trialRemaining <= 10 && trialRemaining > 0 && trialCurrent > 0) {
      toast({
        title: "⚠️ Limite d'essai proche",
        description: `بقي لك ${trialRemaining} طلبية فقط في النسخة التجريبية — Il vous reste seulement ${trialRemaining} commandes gratuites.`,
        variant: "destructive",
      });
    }
  }, [trialRemaining, isTrial]);
  // ── Global real-time SSE listener ────────────────────────────────────────
  // Active for the entire session (not just the orders page).
  // Keeps the sidebar badge and all order lists fresh without any manual refresh.
  useEffect(() => {
    if (!user) return; // only connect when logged in

    // Soft ping using Web Audio API — no external file needed
    const playPing = () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
        osc.onended = () => ctx.close();
      } catch (_) { /* AudioContext not available */ }
    };

    const es = new EventSource("/api/automation/events", { withCredentials: true });

    es.addEventListener("new_order", (e: MessageEvent) => {
      try {
        // Invalidate order lists and sidebar badge count
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stats/filtered"] });
        // Play ping only for automated sources (Shopify, YouCan, WooCommerce)
        const data = JSON.parse(e.data || "{}");
        if (data.source && data.source !== "manual") playPing();
      } catch {}
    });

    es.addEventListener("order_updated", () => {
      try {
        // Refresh order lists and sidebar badge wherever the user currently is
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/orders/filtered"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stats/filtered"] });
      } catch {}
    });

    es.onerror = () => { /* auto-reconnects */ };
    return () => es.close();
  }, [user?.id]);

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

  /* Recent orders for notifications panel */
  const { data: recentOrders } = useQuery<any[]>({
    queryKey: ['/api/orders'],
    enabled: !isMediaBuyer,
    select: (data: any) => {
      const list = Array.isArray(data) ? data : (data?.orders ?? []);
      return list.slice(0, 8);
    },
  });

  const handleLogout = () => {
    setUserDropdownOpen(false);
    logout();
    toast({ title: "Déconnexion réussie", description: "À bientôt !" });
  };

  const baseNav = user?.isSuperAdmin
    ? [...ADMIN_NAV, { name: "Super Admin", href: "/super-admin", icon: Shield }]
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
        <span className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>{t('nav.menu')}</span>
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
              {isIntegrationMenu ? (
                /* Integration — toggle button (no direct navigation) */
                <button
                  onClick={() => setIntegrationOpen(o => !o)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 group",
                    isActive
                      ? "text-white"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  )}
                  style={isActive ? { background: 'rgba(255,255,255,0.18)' } : {}}
                  data-testid="button-integration-menu"
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0 opacity-90" />
                  <span className="flex-1 leading-tight text-left">{t(NAV_KEYS[item.name] || item.name)}</span>
                  {integrationOpen
                    ? <ChevronUp className="w-3.5 h-3.5 opacity-70 shrink-0" />
                    : <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />}
                </button>
              ) : (
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
                  <item.icon className="w-[18px] h-[18px] shrink-0 opacity-90" />
                  <span className="flex-1 leading-tight">{t(NAV_KEYS[item.name] || item.name)}</span>
                  {hasSubmenu && (
                    isActive
                      ? <ChevronUp className="w-3.5 h-3.5 opacity-70 shrink-0" />
                      : <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
                  )}
                </Link>
              )}

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
                        <span>{t(ORDER_SUB_KEYS[sub.name] || sub.name)}</span>
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

              {/* Integration submenu — persistent collapsible */}
              {isIntegrationMenu && integrationOpen && (
                <div className="mt-0.5 mb-1 ml-4 space-y-0.5">
                  {INTEGRATION_SUB_ITEMS.map((sub) => {
                    const subActive = location === sub.href || (sub.name === "Boutiques" && location === "/integrations");
                    return (
                      <Link
                        key={sub.name}
                        href={sub.href}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-100",
                          subActive ? "text-white font-bold" : "text-white/60 hover:text-white hover:bg-white/10"
                        )}
                        style={subActive ? { background: 'rgba(255,255,255,0.15)' } : {}}
                        data-testid={`link-integration-${sub.name.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {t(INTEGRATION_SUB_KEYS[sub.name] || sub.name)}
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
                        {t(NOUVELLE_SUB_KEYS[sub.name] || sub.name)}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Trial progress bar */}
      {isTrial && isOwner && (
        <div className="shrink-0 mx-3 mb-2 rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-[11px] font-bold text-white/80">{t('trial.version')}</span>
            </div>
            <span
              className={cn("text-[11px] font-bold tabular-nums", isBlocked ? "text-red-400" : trialRemaining <= 10 ? "text-amber-300" : "text-white/70")}
              data-testid="text-trial-usage"
            >
              {trialCurrent}/{trialLimit}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${trialPercent}%`,
                background: isBlocked ? '#ef4444' : trialRemaining <= 10 ? '#f59e0b' : '#C5A059',
              }}
            />
          </div>
          {isBlocked ? (
            <p className="text-[10px] text-red-400 font-semibold mt-1.5 text-center">🛑 Compte bloqué — Passez au plan payant</p>
          ) : trialRemaining <= 10 ? (
            <p className="text-[10px] text-amber-300 mt-1.5">⚠️ بقي لك {trialRemaining} طلبية — plus que {trialRemaining}</p>
          ) : (
            <p className="text-[10px] text-white/40 mt-1.5">{trialRemaining} {t('trial.remaining')}</p>
          )}
        </div>
      )}

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
              {user?.role === 'owner' ? t('roles.owner') : user?.role === 'media_buyer' ? t('roles.media_buyer') : t('roles.agent')}
            </p>
          </div>
        </div>
        <Link
          href="/profile"
          className="flex items-center gap-2.5 px-3 py-2 w-full rounded-xl text-xs font-semibold text-white/50 hover:text-white hover:bg-white/10 transition-colors mt-1"
          data-testid="link-profile"
        >
          <User className="w-4 h-4" />
          {t('nav.profile')}
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 py-2 w-full rounded-xl text-xs font-semibold text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          {t('nav.logout')}
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

        {/* ── Impersonation Return Banner ───────────────────────── */}
        {user?.isImpersonating && (
          <div
            className="flex items-center gap-3 px-4 py-2.5 shrink-0"
            style={{ background: 'linear-gradient(90deg, #C5A059, #a07840)', zIndex: 30 }}
            data-testid="banner-impersonation"
          >
            <Shield className="w-4 h-4 text-white shrink-0" />
            <p className="text-white text-xs font-semibold flex-1">
              Mode Super Admin — Vous consultez le compte de cet utilisateur.
            </p>
            <button
              onClick={() => stopImpersonationMutation.mutate()}
              disabled={stopImpersonationMutation.isPending}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all disabled:opacity-60"
              data-testid="button-stop-impersonation"
            >
              <LogOut className="w-3.5 h-3.5" />
              {stopImpersonationMutation.isPending ? "Retour..." : "Retour Super Admin"}
            </button>
          </div>
        )}

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

            {/* Language Switcher */}
            <div ref={langMenuRef} className="relative">
              <button
                onClick={() => setLangMenuOpen(v => !v)}
                className="h-8 px-2.5 rounded-xl text-xs font-bold border border-border/50 hover:bg-muted transition-colors flex items-center gap-1.5 text-foreground"
                data-testid="button-lang-switcher"
              >
                {LANG_OPTIONS.find(l => l.code === i18n.language)?.flag ?? "🌐"}
                <span className="hidden sm:inline">{LANG_OPTIONS.find(l => l.code === i18n.language)?.label ?? "FR"}</span>
              </button>
              {langMenuOpen && (
                <div className="absolute right-0 top-10 w-40 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden py-1">
                  {LANG_OPTIONS.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => { setLanguage(lang.code); setLangMenuOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted",
                        i18n.language === lang.code ? "text-primary font-bold bg-primary/5" : "text-foreground"
                      )}
                      data-testid={`lang-option-${lang.code}`}
                    >
                      <span className="text-base">{lang.flag}</span>
                      <span>{lang.full}</span>
                      {i18n.language === lang.code && <span className="ml-auto text-primary text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Help / Tutorial icon */}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-8 w-8"
              data-testid="button-help"
              onClick={() => setHelpModalOpen(true)}
            >
              <Youtube className="w-4 h-4" />
            </Button>

            {/* Notifications bell */}
            <div ref={notifPanelRef} className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-full h-8 w-8"
                data-testid="button-notifications"
                onClick={() => { setNotifPanelOpen(v => !v); setUserDropdownOpen(false); }}
              >
                <Bell className="w-4 h-4" />
                {newOrdersCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-background" />
                )}
              </Button>

              {/* Notifications panel */}
              {notifPanelOpen && (
                <div className="absolute right-0 top-10 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="font-semibold text-sm">Activité récente</span>
                    {newOrdersCount > 0 && (
                      <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-medium">{newOrdersCount} nouveau{newOrdersCount > 1 ? 'x' : ''}</span>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {(!recentOrders || recentOrders.length === 0) ? (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Bell className="w-8 h-8 mb-2 opacity-30" />
                        <p className="text-xs">Aucune commande récente</p>
                      </div>
                    ) : recentOrders.map((order: any) => {
                      const statusColor: Record<string, string> = {
                        delivered: "text-green-600",
                        nouveau: "text-blue-600",
                        confirme: "text-indigo-600",
                        retourné: "text-orange-500",
                        refused: "text-red-500",
                        expédié: "text-purple-600",
                      };
                      const statusIcon: Record<string, any> = {
                        delivered: CheckCircle2,
                        nouveau: Package2,
                        confirme: CheckCircle2,
                        expédié: Package2,
                      };
                      const StatusIcon = statusIcon[order.status] ?? Clock;
                      const color = statusColor[order.status] ?? "text-muted-foreground";
                      return (
                        <div
                          key={order.id}
                          className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50 cursor-pointer border-b border-border/50 last:border-0"
                          onClick={() => { setNotifPanelOpen(false); navigate("/orders"); }}
                          data-testid={`notif-order-${order.id}`}
                        >
                          <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate">
                              Commande #{order.id} — {order.customerName ?? "Client"}
                            </p>
                            <p className={`text-[10px] font-medium ${color}`}>{order.status}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit' }) : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-4 py-2.5 border-t border-border">
                    <button
                      className="text-xs text-primary font-medium hover:underline w-full text-center"
                      onClick={() => { setNotifPanelOpen(false); navigate("/orders"); }}
                      data-testid="link-all-orders-notif"
                    >
                      Voir toutes les commandes →
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="h-6 w-px bg-border mx-0.5" />

            {/* User dropdown */}
            <div ref={userDropdownRef} className="relative">
              <button
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-muted transition-colors cursor-pointer"
                onClick={() => { setUserDropdownOpen(v => !v); setNotifPanelOpen(false); }}
                data-testid="button-user-menu"
              >
                <Avatar className="w-8 h-8 border-2 border-primary/20">
                  {stores?.[0]?.logoUrl ? (
                    <AvatarImage src={stores[0].logoUrl} />
                  ) : (
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.username || 'U'}&backgroundColor=1a3a8f&textColor=ffffff`} />
                  )}
                  <AvatarFallback className="text-xs font-bold text-white" style={{ background: "hsl(220 72% 38%)" }}>
                    {user?.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold leading-none" data-testid="text-username">{user?.username || 'User'}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {user?.role === 'owner' ? t('roles.owner') : user?.role === 'media_buyer' ? t('roles.media_buyer') : t('roles.agent')}
                  </p>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${userDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Dropdown menu */}
              {userDropdownOpen && (
                <div className="absolute right-0 top-12 w-52 bg-white dark:bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden py-1">
                  {/* User info header */}
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60">
                    <Avatar className="w-9 h-9 border-2 border-primary/20">
                      {stores?.[0]?.logoUrl ? (
                        <AvatarImage src={stores[0].logoUrl} />
                      ) : (
                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.username || 'U'}&backgroundColor=1a3a8f&textColor=ffffff`} />
                      )}
                      <AvatarFallback className="text-xs font-bold text-white" style={{ background: "hsl(220 72% 38%)" }}>
                        {user?.username?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-xs font-bold leading-tight truncate">{user?.username}</p>
                      <p className="text-[10px] text-muted-foreground">{user?.role === 'owner' ? t('roles.owner') : user?.role === 'media_buyer' ? t('roles.media_buyer') : t('roles.agent')}</p>
                    </div>
                  </div>

                  {/* Profile link */}
                  <Link
                    href="/profile"
                    onClick={() => setUserDropdownOpen(false)}
                    data-testid="dropdown-link-profile"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors w-full"
                  >
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{t('nav.profile')}</span>
                  </Link>

                  <div className="h-px bg-border/60 mx-3 my-1" />

                  {/* Logout */}
                  <button
                    onClick={handleLogout}
                    data-testid="dropdown-button-logout"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors w-full"
                  >
                    <Power className="w-4 h-4" />
                    <span className="font-semibold">{t('nav.logout')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Impersonation banner */}
        {(user as any)?.isImpersonating && (
          <div className="flex items-center justify-between px-4 py-2 text-white text-sm font-semibold z-30" style={{ background: "#c53030" }}>
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <span>MODE IMPERSONATION — Vous visualisez en tant que <strong>{user?.username}</strong></span>
            </div>
            <button
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors"
              data-testid="button-stop-impersonation"
              onClick={async () => {
                try {
                  await fetch("/api/admin/stop-impersonation", { method: "POST", credentials: "include" });
                  window.location.href = "/super-admin";
                } catch {}
              }}
            >
              <LogOut className="w-3.5 h-3.5" />
              Retour Super Admin
            </button>
          </div>
        )}

        {/* ── Expiry Warning Banner ────────────────────────────── */}
        {isExpiringSoon && !user?.isSuperAdmin && (
          <div
            className="flex items-center gap-3 px-4 py-3 border-b"
            style={{ background: daysUntilExpiry === 0 ? '#7c2d12' : '#431407', borderColor: '#f97316' }}
            data-testid="banner-expiry-warning"
          >
            <span className="text-lg shrink-0">⚠️</span>
            <p className="text-orange-100 text-sm font-medium flex-1">
              <span className="font-bold text-orange-300">تنبيه:</span> اشتراكك سينتهي في{' '}
              <span className="font-bold text-white">{daysUntilExpiry === 0 ? 'اليوم' : `${daysUntilExpiry} أيام`}</span>.
              يرجى التجديد لضمان استمرارية الخدمة.
            </p>
            <a
              href="/billing"
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90"
              style={{ background: '#f97316' }}
            >
              تجديد
            </a>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden overflow-y-auto">
          <div className="w-full">
            {children}
          </div>
        </main>
      </div>

      {/* ── Paywall Overlay ─────────────────────────────────────── */}
      {showPaywall && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)' }}
          data-testid="paywall-overlay"
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

            {/* ── Header ── */}
            <div
              className="px-6 pt-8 pb-6 text-center"
              style={{ background: 'linear-gradient(135deg, #0f1e38 0%, #1a3a8f 100%)' }}
            >
              {paywallReason === 'expired' ? (
                <>
                  <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)', border: '2px solid #ef4444' }}>
                    <CalendarX className="w-8 h-8 text-red-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">لقد انتهت صلاحية اشتراكك</h2>
                  <p className="text-white/70 text-sm font-medium">Votre abonnement a expiré</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(197,160,89,0.2)', border: '2px solid #C5A059' }}>
                    <Rocket className="w-8 h-8" style={{ color: '#C5A059' }} />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">لقد تجاوزت الحد المسموح به</h2>
                  <p className="text-white/70 text-sm font-medium">Limite de commandes atteinte</p>
                </>
              )}
            </div>

            {/* ── Body ── */}
            <div className="px-6 py-6 space-y-4">

              {paywallReason === 'expired' ? (
                <>
                  <div className="rounded-xl p-4 text-center" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                    <p className="text-sm font-semibold text-red-700 mb-1">يرجى تجديد الدفع لاستعادة الوصول إلى بياناتك وخدماتك.</p>
                    <p className="text-xs text-red-500">Veuillez renouveler votre paiement pour accéder à vos données et services.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl p-4" style={{ background: '#f8f9fa', border: '1px solid #e9ecef' }}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold text-gray-700">Commandes utilisées</span>
                      <span className="text-sm font-bold text-red-500">{trialCurrent}/{trialLimit}</span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden bg-gray-200">
                      <div className="h-full rounded-full bg-red-500" style={{ width: '100%' }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      لقد استهلكت جميع الطلبيات المخصصة لخطة عملك الحالية.
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 text-center">
                    Vous avez dépassé votre quota de commandes. Veuillez passer au plan supérieur.
                  </p>

                  {/* Plans */}
                  <div className="space-y-2">
                    {[
                      { name: "Starter", price: "200 DH", limit: "1 500 commandes/mois", popular: false },
                      { name: "Pro", price: "400 DH", limit: "5 000 commandes/mois", popular: true },
                      { name: "Elite", price: "700 DH", limit: "Illimité", popular: false },
                    ].map((plan) => (
                      <Link
                        key={plan.name}
                        href="/billing"
                        className="flex items-center justify-between p-3 rounded-xl border-2 transition-all cursor-pointer block"
                        style={plan.popular
                          ? { borderColor: '#C5A059', background: 'rgba(197,160,89,0.06)' }
                          : { borderColor: '#e9ecef', background: '#fafafa' }
                        }
                        data-testid={`paywall-plan-${plan.name.toLowerCase()}`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-800">{plan.name}</span>
                            {plan.popular && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: '#C5A059' }}>Populaire</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{plan.limit}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold" style={{ color: '#0f1e38' }}>{plan.price}</p>
                          <p className="text-[10px] text-gray-400">/ mois</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              )}

              {/* CTA Buttons */}
              <div className="space-y-2.5">
                <Link
                  href="/billing"
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #C5A059 0%, #d4b06a 100%)' }}
                  data-testid="paywall-cta-button"
                >
                  <Zap className="w-4 h-4" />
                  {paywallReason === 'expired' ? 'Renouveler l\'abonnement' : 'Passer au plan supérieur (Upgrade)'}
                </Link>
                <a
                  href="https://wa.me/212600000000?text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20pour%20mon%20abonnement%20TajerGrow."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                  style={{ background: '#25D366', color: '#fff' }}
                  data-testid="paywall-whatsapp-button"
                >
                  <MessageCircle className="w-4 h-4" />
                  Contacter l'Administration / WhatsApp
                </a>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── Help / Tutorial Modal ───────────────────────────────── */}
      {helpModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setHelpModalOpen(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center">
                  <Youtube className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Centre d'aide & Tutoriels</h3>
                  <p className="text-[10px] text-muted-foreground">Guides vidéo TajerGrow</p>
                </div>
              </div>
              <button onClick={() => setHelpModalOpen(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" data-testid="button-close-help">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { title: "Démarrage rapide — Créer votre première commande", duration: "3:42", tag: "Débutant" },
                { title: "Gestion des stocks & variantes produits", duration: "5:18", tag: "Stock" },
                { title: "Configurer les intégrations Shopify & WooCommerce", duration: "7:05", tag: "Intégrations" },
                { title: "Attribution Media Buyer & suivi des performances", duration: "4:55", tag: "Analytics" },
                { title: "Gestion de l'équipe — Rôles Agent et Admin", duration: "3:22", tag: "Équipe" },
              ].map((video, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors cursor-pointer group" data-testid={`help-video-${i}`}>
                  <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0 group-hover:bg-red-200 dark:group-hover:bg-red-900 transition-colors">
                    <PlayCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold leading-tight truncate">{video.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{video.duration}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0">{video.tag}</span>
                </div>
              ))}
            </div>
            <div className="px-5 pb-4">
              <a
                href="https://youtube.com/@TajerGrow"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
                data-testid="link-youtube-channel"
              >
                <Youtube className="w-4 h-4" />
                Voir la chaîne YouTube
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
