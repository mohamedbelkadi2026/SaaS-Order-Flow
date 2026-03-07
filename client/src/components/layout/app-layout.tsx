import { useState, useEffect } from "react";
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
  ClipboardList
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";

const ADMIN_NAV = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Mes Commandes", href: "/orders", icon: ShoppingCart, hasSubmenu: true },
  { name: "Commandes (Toutes)", href: "/orders", icon: ClipboardList },
  { name: "Nouvelle commande", href: "/orders", icon: ShoppingCart },
  { name: "Stock", href: "/inventory", icon: Package },
  { name: "Magasins", href: "/magasins", icon: Store },
  { name: "List Client", href: "/orders", icon: UserCircle },
  { name: "Gestion de l'Équipe", href: "/team", icon: Users },
  { name: "Factures", href: "/invoices", icon: FileText },
  { name: "Advanced Profitability", href: "/profitability", icon: Calculator },
  { name: "Integration", href: "/integrations", icon: Plug, hasSubmenu: true },
];

const ORDER_SUB_ITEMS = [
  { name: "Nouveaux", href: "/orders" },
  { name: "Confirmation", href: "/orders/confirmation" },
  { name: "Annules", href: "/orders/annules" },
  { name: "Suivies", href: "/orders/suivies" },
  { name: "Livrées", href: "/orders/livrees" },
];

const INTEGRATION_SUB_ITEMS = [
  { name: "Boutiques", href: "/integrations" },
  { name: "Sociétés de Livraison", href: "/integrations/shipping" },
  { name: "Journal", href: "/integrations/logs" },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isDark, setIsDark] = useState(false);
  const { user, logout } = useAuth();

  useEffect(() => {
    if (isDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDark]);

  const navItems = ADMIN_NAV;

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border w-64">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl shadow-lg shadow-primary/25">
          G
        </div>
        <span className="font-display font-bold text-xl text-sidebar-foreground">Garean</span>
      </div>
      
      <div className="px-4 pb-2">
        <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2 px-2">Menu</div>
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || 
            (item.name === "Integration" && location.startsWith("/integrations")) ||
            (item.name === "Mes Commandes" && location.startsWith("/orders"));
          const isOrdersMenu = item.name === "Mes Commandes";
          const isIntegrationMenu = item.name === "Integration";

          return (
            <div key={item.name} className="space-y-0.5">
              <Link href={item.href} className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}>
                <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-sidebar-foreground/50")} />
                {item.name}
                {item.hasSubmenu && <ChevronDown className="w-3 h-3 ml-auto" />}
              </Link>
              
              {isOrdersMenu && (
                <div className="ml-8 space-y-0.5 mt-0.5">
                  {ORDER_SUB_ITEMS.map((sub) => (
                    <Link key={sub.name} href={sub.href} className={cn(
                      "block px-3 py-1.5 text-xs rounded-lg transition-colors",
                      location === sub.href
                        ? "text-primary font-medium" 
                        : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
                    )}>
                      {sub.name}
                    </Link>
                  ))}
                </div>
              )}

              {isIntegrationMenu && (
                <div className="ml-8 space-y-0.5 mt-0.5">
                  {INTEGRATION_SUB_ITEMS.map((sub) => (
                    <Link key={sub.name} href={sub.href} className={cn(
                      "block px-3 py-1.5 text-xs rounded-lg transition-colors",
                      location === sub.href || (sub.name === "Stores" && location === "/integrations")
                        ? "text-primary font-medium" 
                        : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
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
        <button 
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm font-medium text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
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
      <div className="hidden lg:block h-screen sticky top-0 shrink-0 z-20">
        <SidebarContent />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-background/80 backdrop-blur-md border-b border-border sticky top-0 z-10 flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 bg-sidebar border-none">
                <SidebarContent />
              </SheetContent>
            </Sheet>

            <div className="relative hidden md:block w-96 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                placeholder="Rechercher commandes, clients, tracking..." 
                className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:ring-primary/20 rounded-xl transition-all"
                data-testid="input-search"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="icon" onClick={() => setIsDark(!isDark)} className="rounded-full" data-testid="button-theme">
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            
            <Button variant="ghost" size="icon" className="relative rounded-full" data-testid="button-notifications">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full border-2 border-background"></span>
            </Button>

            <div className="h-8 w-px bg-border mx-1"></div>

            <div className="flex items-center gap-3 p-1.5 rounded-full sm:rounded-xl text-left">
              <Avatar className="w-9 h-9 border border-border">
                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.username || 'U'}`} />
                <AvatarFallback>{user?.username?.[0] || 'U'}</AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-none" data-testid="text-username">{user?.username || 'User'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{user?.role === 'owner' ? 'Admin' : 'Agent'}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground hidden sm:block" />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-x-hidden">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
