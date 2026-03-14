import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  User, Globe, MessageCircle, CreditCard, Shield,
  Camera, TrendingUp, Users, Store, Zap, Lock, Save,
  CheckCircle, Upload
} from "lucide-react";

const GOLD = "#C5A059";

const DEFAULT_WHATSAPP_TEMPLATE = `👋 Bonjour *{Nom_Client}*\nBienvenue chez Votre Boutique ! Nous sommes ravis de vous accueillir.\nDécouvrez nos dernières offres et nouveautés sur notre site web : https://votre-boutique.com`;
const DEFAULT_CUSTOM_TEMPLATE = `✅ Bonjour *{Nom_Client}*\nVotre commande *{Nom_Produit}* a bien été confirmée.\nMontant: *{Montant_Commande}*\nVille: *{Ville_Client}*`;
const DEFAULT_SHIPPING_TEMPLATE = `🚚 Bonjour *{Nom_Client}*\nVotre commande est en route !\nTransporteur: *{Transporteur}*\nDate de livraison estimée: *{Date_Livraison}*`;

const WA_VARIABLES = [
  "*{Nom_Client}*", "*{Ville_Client}*", "*{Address_Client}*", "*{Phone_Client}*",
  "*{Date_Commande}*", "*{Heure}*", "*{Nom_Produit}*", "*{Transporteur}*", "*{Date_Livraison}*",
  "*{Montant_Commande}*"
];

const TABS = [
  { id: "profil", label: "Profil", icon: User },
  { id: "reseaux", label: "Réseaux", icon: Globe },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "abonnement", label: "Abonnement", icon: CreditCard },
  { id: "securite", label: "Sécurité", icon: Shield },
];

const WA_TABS = ["Défaut", "Personnalisé", "Après Expédition"];

export default function Profile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("profil");
  const [waTab, setWaTab] = useState(0);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { data: store } = useQuery<any>({ queryKey: ["/api/store"] });
  const { data: sub } = useQuery<any>({ queryKey: ["/api/user/subscription-detail"] });

  // ── Tab 1: Profil form state ───────────────────────────────────────────────
  const [profil, setProfil] = useState({ username: user?.username ?? "", email: user?.email ?? "", phone: user?.phone ?? "" });
  const updateProfil = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/user/profile", data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: "Profil mis à jour", description: "Vos informations ont été sauvegardées." });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // ── Tab 2: Réseaux form state ───────────────────────────────────────────────
  const [social, setSocial] = useState({
    website: store?.website ?? "", facebook: store?.facebook ?? "",
    instagram: store?.instagram ?? "", otherSocial: store?.otherSocial ?? ""
  });
  useState(() => { if (store) setSocial({ website: store.website ?? "", facebook: store.facebook ?? "", instagram: store.instagram ?? "", otherSocial: store.otherSocial ?? "" }); });

  const updateSocial = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/store/social", data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/store"] });
      toast({ title: "Réseaux sauvegardés" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // ── Tab 3: WhatsApp templates state ────────────────────────────────────────
  const [waDefault, setWaDefault] = useState(store?.whatsappTemplate ?? DEFAULT_WHATSAPP_TEMPLATE);
  const [waCustom, setWaCustom] = useState(store?.whatsappTemplateCustom ?? DEFAULT_CUSTOM_TEMPLATE);
  const [waShipping, setWaShipping] = useState(store?.whatsappTemplateShipping ?? DEFAULT_SHIPPING_TEMPLATE);
  const [waDefaultEnabled, setWaDefaultEnabled] = useState((store?.whatsappDefaultEnabled ?? 1) === 1);
  const [waCustomEnabled, setWaCustomEnabled] = useState((store?.whatsappCustomEnabled ?? 0) === 1);
  const [waShippingEnabled, setWaShippingEnabled] = useState((store?.whatsappShippingEnabled ?? 0) === 1);

  const currentWaValue = [waDefault, waCustom, waShipping][waTab];
  const setCurrentWa = [setWaDefault, setWaCustom, setWaShipping][waTab];
  const currentWaEnabled = [waDefaultEnabled, waCustomEnabled, waShippingEnabled][waTab];
  const setCurrentWaEnabled = [setWaDefaultEnabled, setWaCustomEnabled, setWaShippingEnabled][waTab];

  const waPreview = currentWaValue
    .replace(/\*\{Nom_Client\}\*/g, "Fatima")
    .replace(/\*\{Ville_Client\}\*/g, "Casablanca")
    .replace(/\*\{Address_Client\}\*/g, "Bd Mohammed V")
    .replace(/\*\{Phone_Client\}\*/g, "+212 600 000 000")
    .replace(/\*\{Date_Commande\}\*/g, "14/03/2026")
    .replace(/\*\{Heure\}\*/g, "10:30")
    .replace(/\*\{Nom_Produit\}\*/g, "Mocassins ANAKIO")
    .replace(/\*\{Transporteur\}\*/g, "Amana")
    .replace(/\*\{Date_Livraison\}\*/g, "16/03/2026")
    .replace(/\*\{Montant_Commande\}\*/g, "379 DH");

  const updateWa = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/store/whatsapp-templates", data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/store"] });
      toast({ title: "Templates WhatsApp sauvegardés" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const insertVariable = (v: string) => {
    setCurrentWa((prev: string) => prev + v);
  };

  // ── Tab 5: Sécurité state ───────────────────────────────────────────────────
  const [pwd, setPwd] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const updatePwd = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/user/password", data),
    onSuccess: () => {
      setPwd({ currentPassword: "", newPassword: "", confirm: "" });
      toast({ title: "Mot de passe mis à jour" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // ── Logo upload ─────────────────────────────────────────────────────────────
  const uploadLogo = useMutation({
    mutationFn: (logoUrl: string) => apiRequest("POST", "/api/store/logo", { logoUrl }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/store"] });
      toast({ title: "Logo mis à jour" });
    },
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => uploadLogo.mutate(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ── Plan usage ───────────────────────────────────────────────────────────────
  const monthlyOrders = sub?.currentMonthOrders ?? 0;
  const monthlyLimit = sub?.monthlyLimit ?? 1500;
  const usagePct = Math.min(100, Math.round((monthlyOrders / monthlyLimit) * 100));
  const planLabel = sub?.plan ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1) : "Starter";

  return (
    <div className="min-h-screen bg-background">
      {/* Cover banner */}
      <div className="h-40 w-full bg-gradient-to-r from-slate-700 via-slate-600 to-slate-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80')", backgroundSize: "cover", backgroundPosition: "center" }} />
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-10 pb-10">
        <div className="flex gap-6 items-start">
          {/* ── Left sidebar ──────────────────────────────────────────────────── */}
          <div className="w-52 shrink-0 space-y-4">
            {/* Logo */}
            <div className="relative w-32 h-32 rounded-2xl border-4 border-background bg-white overflow-hidden shadow-lg cursor-pointer group" onClick={() => logoInputRef.current?.click()}>
              {store?.logoUrl ? (
                <img src={store.logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-100">
                  <Store className="w-10 h-10 text-slate-400" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-6 h-6 text-white" />
              </div>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            </div>

            {/* User info */}
            <div>
              <h2 className="font-bold text-lg leading-tight">{user?.username}</h2>
              <p className="text-muted-foreground text-sm">@{store?.name ?? user?.username}</p>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1">
              <Badge className="text-xs px-2 py-0.5" style={{ backgroundColor: "#1e3a5f", color: "white" }}>
                Plan : {planLabel}
              </Badge>
              <Badge className="text-xs px-2 py-0.5 bg-green-500 hover:bg-green-500 text-white">Actif</Badge>
            </div>

            {/* Upgrade button */}
            <Button size="sm" className="w-full text-sm font-semibold" style={{ backgroundColor: GOLD, color: "white" }}>
              <TrendingUp className="w-3.5 h-3.5 mr-1" /> Upgrade
            </Button>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <p className="text-xs text-muted-foreground leading-tight">BOUTIQUES</p>
                <p className="font-bold text-sm">{sub?.storeCount ?? 1}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground leading-tight">ÉQUIPE</p>
                <p className="font-bold text-sm">{sub?.teamCount ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground leading-tight">COMMANDES</p>
                <p className="font-bold text-sm">{monthlyOrders}</p>
              </div>
            </div>

            {/* Usage progress */}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Utilisation du plan (commandes)</span>
                <span>{usagePct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${usagePct}%`, backgroundColor: usagePct >= 80 ? "#ef4444" : "#22c55e" }}
                />
              </div>
              <div className="flex gap-1 mt-1 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">Boutiques : 0% (ok)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">Équipe : 0% (ok)</span>
              </div>
            </div>
          </div>

          {/* ── Main content ─────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 pt-12">
            {/* Tabs */}
            <div className="flex border-b mb-6 gap-0.5">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    data-testid={`tab-${tab.id}`}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      active
                        ? "border-[#C5A059] text-[#C5A059]"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* ── Tab: Profil ─────────────────────────────────────────────── */}
            {activeTab === "profil" && (
              <Card className="p-6 rounded-2xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nom complet</Label>
                    <Input data-testid="input-username" value={profil.username} onChange={e => setProfil(p => ({ ...p, username: e.target.value }))} placeholder="Votre nom" />
                  </div>
                  <div className="space-y-2">
                    <Label>Numéro de téléphone</Label>
                    <Input data-testid="input-phone" value={profil.phone} onChange={e => setProfil(p => ({ ...p, phone: e.target.value }))} placeholder="+212600000000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input data-testid="input-email" type="email" value={profil.email} onChange={e => setProfil(p => ({ ...p, email: e.target.value }))} placeholder="email@exemple.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Date d'enregistrement</Label>
                    <Input disabled value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-MA') : "—"} className="bg-muted" />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <Button
                    data-testid="button-save-profil"
                    disabled={updateProfil.isPending}
                    onClick={() => updateProfil.mutate({ username: profil.username, email: profil.email || null, phone: profil.phone || null })}
                    style={{ backgroundColor: GOLD, color: "white" }}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {updateProfil.isPending ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </div>
              </Card>
            )}

            {/* ── Tab: Réseaux ────────────────────────────────────────────── */}
            {activeTab === "reseaux" && (
              <Card className="p-6 rounded-2xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Site web</Label>
                    <Input data-testid="input-website" value={social.website} onChange={e => setSocial(s => ({ ...s, website: e.target.value }))} placeholder="https://votre-boutique.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Facebook</Label>
                    <Input data-testid="input-facebook" value={social.facebook} onChange={e => setSocial(s => ({ ...s, facebook: e.target.value }))} placeholder="https://facebook.com/yourprofile" />
                  </div>
                  <div className="space-y-2">
                    <Label>Instagram</Label>
                    <Input data-testid="input-instagram" value={social.instagram} onChange={e => setSocial(s => ({ ...s, instagram: e.target.value }))} placeholder="https://instagram.com/yourprofile" />
                  </div>
                  <div className="space-y-2">
                    <Label>Autre réseau</Label>
                    <Input data-testid="input-other-social" value={social.otherSocial} onChange={e => setSocial(s => ({ ...s, otherSocial: e.target.value }))} placeholder="Entrez un autre réseau" />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <Button
                    data-testid="button-save-social"
                    disabled={updateSocial.isPending}
                    onClick={() => updateSocial.mutate(social)}
                    style={{ backgroundColor: GOLD, color: "white" }}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {updateSocial.isPending ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </div>
              </Card>
            )}

            {/* ── Tab: WhatsApp ───────────────────────────────────────────── */}
            {activeTab === "whatsapp" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl text-white" style={{ background: "linear-gradient(135deg, #25d366, #128c7e)" }}>
                  <div className="flex items-center gap-2 font-semibold text-lg">
                    <MessageCircle className="w-5 h-5" />
                    Modèles de messages WhatsApp
                  </div>
                  <Badge className="bg-white/20 text-white border-white/30">Version Pro</Badge>
                </div>

                {/* WhatsApp sub-tabs */}
                <div className="flex gap-2">
                  {WA_TABS.map((wt, i) => (
                    <button
                      key={wt}
                      data-testid={`wa-tab-${i}`}
                      onClick={() => setWaTab(i)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        waTab === i ? "bg-[#25d366] text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {i === 0 ? <MessageCircle className="w-3.5 h-3.5" /> : i === 1 ? <Zap className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      {wt}
                    </button>
                  ))}
                </div>

                <Card className="p-4 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2 text-[#25d366]">
                      <MessageCircle className="w-4 h-4" />
                      {["Message de Bienvenue", "Message Personnalisé", "Après Expédition"][waTab]}
                    </h3>
                  </div>

                  {/* Preview bubble */}
                  <div className="rounded-xl p-4 bg-[#ece5dd] dark:bg-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-[#25d366] flex items-center justify-center">
                        <MessageCircle className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-xs">{store?.name ?? "votre boutique"}</p>
                        <p className="text-[10px] text-muted-foreground">WhatsApp Business</p>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-700 rounded-lg rounded-tl-none p-3 shadow-sm max-w-xs">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{waPreview}</p>
                      <p className="text-[10px] text-muted-foreground text-right mt-1">
                        {new Date().toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  {/* Editor */}
                  <div className="space-y-2">
                    <Label>Modifier le message</Label>
                    <Textarea
                      data-testid={`wa-editor-${waTab}`}
                      value={currentWaValue}
                      onChange={e => setCurrentWa(e.target.value)}
                      rows={6}
                      placeholder="Votre message WhatsApp..."
                      className="font-mono text-sm resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      data-testid={`wa-enabled-${waTab}`}
                      checked={currentWaEnabled}
                      onCheckedChange={v => setCurrentWaEnabled(v)}
                    />
                    <Label>Activer ce modèle</Label>
                  </div>

                  {/* Variables */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" style={{ color: GOLD }} />
                      Variables disponibles:
                    </Label>
                    <p className="text-xs text-muted-foreground">Cliquez sur n'importe quelle variable pour l'ajouter au message</p>
                    <div className="flex flex-wrap gap-2">
                      {WA_VARIABLES.map(v => (
                        <button
                          key={v}
                          onClick={() => insertVariable(v)}
                          data-testid={`wa-var-${v}`}
                          className="px-2 py-1 rounded-md text-xs font-mono border border-border hover:border-[#C5A059] hover:text-[#C5A059] transition-colors bg-muted"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      data-testid="button-save-whatsapp"
                      disabled={updateWa.isPending}
                      onClick={() => updateWa.mutate({
                        whatsappTemplate: waDefault,
                        whatsappTemplateCustom: waCustom,
                        whatsappTemplateShipping: waShipping,
                        whatsappDefaultEnabled: waDefaultEnabled ? 1 : 0,
                        whatsappCustomEnabled: waCustomEnabled ? 1 : 0,
                        whatsappShippingEnabled: waShippingEnabled ? 1 : 0,
                      })}
                      style={{ backgroundColor: "#25d366", color: "white" }}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {updateWa.isPending ? "Enregistrement..." : "Sauvegarder les templates"}
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* ── Tab: Abonnement ─────────────────────────────────────────── */}
            {activeTab === "abonnement" && (
              <Card className="p-6 rounded-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-bold text-lg">Plan actuel : {planLabel}</h3>
                    {sub?.billingCycleStart && (
                      <p className="text-sm text-muted-foreground">
                        Du {new Date(sub.billingCycleStart).toLocaleDateString('fr-MA')} au{" "}
                        {new Date(new Date(sub.billingCycleStart).setMonth(new Date(sub.billingCycleStart).getMonth() + 1)).toLocaleDateString('fr-MA')}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" style={{ borderColor: GOLD, color: GOLD }}>
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Changer / Mettre à niveau
                  </Button>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-semibold">Mois</th>
                      <th className="text-left py-2 font-semibold">Commandes</th>
                      <th className="text-left py-2 font-semibold">Boutiques</th>
                      <th className="text-left py-2 font-semibold">Équipe</th>
                      <th className="text-left py-2 font-semibold">Dernière mise à jour</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-3" data-testid="text-sub-month">{sub?.month}</td>
                      <td className="py-3" data-testid="text-sub-orders">{sub?.currentMonthOrders ?? 0}</td>
                      <td className="py-3" data-testid="text-sub-stores">{sub?.storeCount ?? 1}</td>
                      <td className="py-3" data-testid="text-sub-team">{sub?.teamCount ?? 0}</td>
                      <td className="py-3 text-muted-foreground text-xs">{sub?.billingCycleStart ? new Date(sub.billingCycleStart).toLocaleString('fr-MA') : "—"}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="mt-6 p-4 rounded-xl bg-muted/50">
                  <div className="flex justify-between text-sm mb-2">
                    <span>Utilisation du plan</span>
                    <span className="font-semibold">{monthlyOrders} / {monthlyLimit} commandes ({usagePct}%)</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${usagePct}%`, backgroundColor: usagePct >= 80 ? "#ef4444" : usagePct >= 50 ? "#f59e0b" : "#22c55e" }}
                    />
                  </div>
                </div>
              </Card>
            )}

            {/* ── Tab: Sécurité ───────────────────────────────────────────── */}
            {activeTab === "securite" && (
              <Card className="p-6 rounded-2xl space-y-4">
                <div className="space-y-2">
                  <Label>Mot de Passe Actuel:</Label>
                  <Input
                    data-testid="input-current-password"
                    type="password"
                    value={pwd.currentPassword}
                    onChange={e => setPwd(p => ({ ...p, currentPassword: e.target.value }))}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nouveau Mot de Passe:</Label>
                  <Input
                    data-testid="input-new-password"
                    type="password"
                    value={pwd.newPassword}
                    onChange={e => setPwd(p => ({ ...p, newPassword: e.target.value }))}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirmer le Nouveau Mot de Passe:</Label>
                  <Input
                    data-testid="input-confirm-password"
                    type="password"
                    value={pwd.confirm}
                    onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))}
                    placeholder="••••••••"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    data-testid="button-save-password"
                    disabled={updatePwd.isPending}
                    onClick={() => {
                      if (pwd.newPassword !== pwd.confirm) {
                        toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" });
                        return;
                      }
                      updatePwd.mutate({ currentPassword: pwd.currentPassword, newPassword: pwd.newPassword });
                    }}
                    style={{ backgroundColor: GOLD, color: "white" }}
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    {updatePwd.isPending ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
