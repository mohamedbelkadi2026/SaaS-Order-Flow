import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  LayoutDashboard, Package, ShoppingCart, User, LogOut, Menu, X, ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/tajerdrop/dashboard",  label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/tajerdrop/catalogue",  label: "Catalogue",       icon: Package },
  { href: "/tajerdrop/commandes",  label: "Mes commandes",   icon: ShoppingCart },
  { href: "/tajerdrop/profil",     label: "Mon profil",      icon: User },
];

const NAVY  = "#0f1e38";
const GOLD  = "#C5A059";
const LIGHT = "#f8f4ed";

export function TajerDropLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  const logout = useMutation({
    mutationFn: () => apiRequest("POST", "/api/logout"),
    onSuccess: () => {
      qc.clear();
      window.location.href = "/";
    },
  });

  const Sidebar = ({ mobile = false }) => (
    <aside
      style={{ background: NAVY, borderRight: mobile ? "none" : `2px solid ${GOLD}30` }}
      className={mobile
        ? "fixed inset-y-0 left-0 z-50 w-72 flex flex-col"
        : "hidden lg:flex flex-col w-64 shrink-0 min-h-screen"}
    >
      {/* Logo */}
      <div className="px-6 py-6 border-b" style={{ borderColor: `${GOLD}30` }}>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black tracking-tight" style={{ color: GOLD }}>Tajer</span>
          <span className="text-2xl font-black tracking-tight text-white">Drop</span>
        </div>
        <p className="text-xs mt-1" style={{ color: `${GOLD}99` }}>Espace Seller</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = location === href || location.startsWith(href + "/");
          return (
            <Link key={href} href={href}>
              <a
                onClick={() => mobile && setMobileOpen(false)}
                style={{
                  background: active ? `${GOLD}20` : "transparent",
                  color: active ? GOLD : "rgba(255,255,255,0.72)",
                  borderLeft: active ? `3px solid ${GOLD}` : "3px solid transparent",
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm font-medium transition-all hover:bg-white/5"
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-60" />}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="px-4 py-4 border-t space-y-2" style={{ borderColor: `${GOLD}30` }}>
        <p className="text-xs truncate" style={{ color: `${GOLD}80` }}>
          {(user as any)?.username || (user as any)?.email}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-900/20"
          onClick={() => logout.mutate()}
        >
          <LogOut className="w-4 h-4 mr-2" /> Déconnexion
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen" style={{ background: LIGHT }}>
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      {mobileOpen && <Sidebar mobile />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header
          className="lg:hidden flex items-center justify-between px-4 py-3 sticky top-0 z-30"
          style={{ background: NAVY, borderBottom: `2px solid ${GOLD}30` }}
        >
          <button onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" style={{ color: GOLD }} />
          </button>
          <div className="flex items-center gap-1">
            <span className="text-lg font-black" style={{ color: GOLD }}>Tajer</span>
            <span className="text-lg font-black text-white">Drop</span>
          </div>
          <div className="w-5" />
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
