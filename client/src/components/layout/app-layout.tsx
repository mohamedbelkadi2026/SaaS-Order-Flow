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
  Store
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Team Management", href: "/team", icon: Users },
  { name: "Magasins", href: "/magasins", icon: Store },
  { name: "Invoices", href: "/invoices", icon: FileText },
  { name: "Adv. Profitability", href: "/profitability", icon: Calculator },
  { name: "Integrations", href: "/integrations", icon: Plug },
];

const INTEGRATION_SUB_ITEMS = [
  { name: "Stores", href: "/integrations/stores" },
  { name: "Sociétés de Livraison", href: "/integrations/shipping" },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (isDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDark]);

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

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href || (item.name === "Integrations" && location.startsWith("/integrations"));
          const isIntegrations = item.name === "Integrations";

          return (
            <div key={item.name} className="space-y-1">
              <Link href={item.href} className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}>
                <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-sidebar-foreground/50")} />
                {item.name}
              </Link>
              
              {isIntegrations && (
                <div className="ml-9 space-y-1 mt-1">
                  {INTEGRATION_SUB_ITEMS.map((sub) => (
                    <Link key={sub.name} href={sub.name === "Stores" ? "/integrations" : sub.href} className={cn(
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

      <div className="p-4 mt-auto">
        <div className="bg-sidebar-accent/50 rounded-2xl p-4 border border-sidebar-border">
          <p className="text-sm font-medium text-sidebar-foreground">Need help?</p>
          <p className="text-xs text-sidebar-foreground/60 mt-1 mb-3">Check our docs or contact support.</p>
          <Button variant="outline" size="sm" className="w-full bg-background">Documentation</Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex w-full font-sans">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block h-screen sticky top-0 shrink-0 z-20">
        <SidebarContent />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
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
                placeholder="Search orders, clients, tracking..." 
                className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:ring-primary/20 rounded-xl transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="icon" onClick={() => setIsDark(!isDark)} className="rounded-full">
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            
            <Button variant="ghost" size="icon" className="relative rounded-full">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full border-2 border-background"></span>
            </Button>

            <div className="h-8 w-px bg-border mx-1"></div>

            <button className="flex items-center gap-3 hover:bg-muted/50 p-1.5 rounded-full sm:rounded-xl transition-colors text-left">
              <Avatar className="w-9 h-9 border border-border">
                <AvatarImage src="https://i.pravatar.cc/150?u=admin" />
                <AvatarFallback>AD</AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-none">Admin Store 1</p>
                <p className="text-xs text-muted-foreground mt-0.5">Owner</p>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground hidden sm:block" />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 lg:p-8 overflow-x-hidden">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
