import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  User, Globe, MessageCircle, CreditCard, Shield,
  Camera, TrendingUp, Store, Zap, Lock, Save, CheckCircle,
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

  // ── Profil form ─────────────────────────────────────────────────────────────
  const [profil, setProfil] = useState({ username: user?.username ?? "", email: user?.email ?? "", phone: user?.phone ?? "" });
  const updateProfil = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/user/profile", data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: "Profil mis à jour", description: "Vos informations ont été sauvegardées." });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // ── Réseaux form ────────────────────────────────────────────────────────────
  const [social, setSocial] = useState({
    website: store?.website ?? "", facebook: store?.facebook ?? "",
    instagram: store?.instagram ?? "", otherSocial: store?.otherSocial ?? ""
  });
  useState(() => {
    if (store) setSocial({ website: store.website ?? "", facebook: store.facebook ?? "", instagram: store.instagram ?? "", otherSocial: store.otherSocial ?? "" });
  });
  const updateSocial = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/store/social", data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/store"] });
      toast({ title: "Réseaux sauvegardés" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // ── WhatsApp templates ──────────────────────────────────────────────────────
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

  const insertVariable = (v: string) => setCurrentWa((prev: string) => prev + v);

  // ── Sécurité ────────────────────────────────────────────────────────────────
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

  // ── Sound notification preferences (localStorage per device) ────────────────
  const SOUNDS = [
    { id: 'cash',    label: '💵 Cha-ching (Caisse)' },
    { id: 'bell',    label: '🔔 Cloche' },
    { id: 'chime',   label: '✨ Carillon' },
    { id: 'ding',    label: '🎵 Ding' },
    { id: 'success', label: '✅ Succès' },
  ];
  const playTone = (soundId: string) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const sounds: Record<string, () => void> = {
        cash: () => {
          // Realistic cash register "cha-ching" sound
          const masterGain = ctx.createGain();
          masterGain.connect(ctx.destination);
          masterGain.gain.value = 0.6;

          // "Cha" — drawer mechanism (noise burst)
          const bufferSize = ctx.sampleRate * 0.08;
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
          }
          const noise = ctx.createBufferSource();
          noise.buffer = buffer;
          const noiseFilter = ctx.createBiquadFilter();
          noiseFilter.type = 'bandpass';
          noiseFilter.frequency.value = 3000;
          noiseFilter.Q.value = 0.5;
          noise.connect(noiseFilter);
          noiseFilter.connect(masterGain);
          noise.start(ctx.currentTime);

          // "Ching" — metal bell ring (high frequency)
          [1800, 2200, 2800, 3400].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(masterGain);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = ctx.currentTime + 0.06 + i * 0.01;
            gain.gain.setValueAtTime(0.3 - i * 0.05, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
            osc.start(t);
            osc.stop(t + 0.8);
          });

          // Low "clunk" — drawer opening thud
          const clunk = ctx.createOscillator();
          const clunkGain = ctx.createGain();
          clunk.connect(clunkGain);
          clunkGain.connect(masterGain);
          clunk.type = 'sine';
          clunk.frequency.setValueAtTime(180, ctx.currentTime);
          clunk.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.1);
          clunkGain.gain.setValueAtTime(0.5, ctx.currentTime);
          clunkGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
          clunk.start(ctx.currentTime);
          clunk.stop(ctx.currentTime + 0.1);

          setTimeout(() => ctx.close(), 2000);
        },
        bell: () => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.value = 659;
          gain.gain.setValueAtTime(0.5, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
          osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 1.2);
        },
        chime: () => {
          [523, 659, 784].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.15;
            gain.gain.setValueAtTime(0.35, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            osc.start(t); osc.stop(t + 0.4);
          });
        },
        ding: () => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.value = 1047;
          gain.gain.setValueAtTime(0.45, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        },
        success: () => {
          [523, 659, 784, 1047].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'square';
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.1;
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc.start(t); osc.stop(t + 0.15);
          });
        },
      };
      (sounds[soundId] || sounds.cash)();
      setTimeout(() => ctx.close(), 3000);
    } catch {}
  };

  const [pendingSoundEnabled, setPendingSoundEnabled] = useState(
    () => localStorage.getItem('notif_sound_enabled') !== 'false'
  );
  const [pendingSound, setPendingSound] = useState(
    () => localStorage.getItem('notif_sound_id') || 'cash'
  );
  const [soundSaved, setSoundSaved] = useState(false);

  useEffect(() => {
    setPendingSound(localStorage.getItem('notif_sound_id') || 'cash');
    setPendingSoundEnabled(localStorage.getItem('notif_sound_enabled') !== 'false');
  }, []);

  const saveSoundSettings = () => {
    localStorage.setItem('notif_sound_id', pendingSound);
    localStorage.setItem('notif_sound_enabled', String(pendingSoundEnabled));
    setSoundSaved(true);
    setTimeout(() => setSoundSaved(false), 2000);
  };

  const testSound = (id: string) => {
    playTone(id);
  };

  // ── Plan usage ───────────────────────────────────────────────────────────────
  const monthlyOrders = sub?.currentMonthOrders ?? 0;
  const monthlyLimit = sub?.monthlyLimit ?? 1500;
  const usagePct = Math.min(100, Math.round((monthlyOrders / monthlyLimit) * 100));
  const planLabel = sub?.plan ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1) : "Starter";

  // ── Shared save button (full width mobile, auto desktop) ─────────────────
  const SaveBtn = ({ onClick, pending, label = "Enregistrer", icon: Icon = Save, color = GOLD }: any) => (
    <div className="flex justify-end mt-4">
      <Button
        data-testid="button-save"
        disabled={pending}
        onClick={onClick}
        className="w-full md:w-auto"
        style={{ backgroundColor: color, color: "white" }}
      >
        <Icon className="w-4 h-4 mr-2" />
        {pending ? "Enregistrement..." : label}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Cover banner */}
      <div className="h-28 md:h-40 w-full bg-gradient-to-r from-slate-700 via-slate-600 to-slate-800 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80')", backgroundSize: "cover", backgroundPosition: "center" }}
        />
      </div>

      {/* Page body */}
      <div className="max-w-6xl mx-auto px-4 -mt-10 pb-10">

        {/*
          LAYOUT:
          Mobile  → vertical stack: [Profile Summary Card] → [Tabs + Content]
          Desktop → side by side: [Sidebar (w-52)] | [Tabs + Content]
        */}
        <div className="flex flex-col md:flex-row md:gap-6 md:items-start">

          {/* ── Profile Summary Card ──────────────────────────────────────── */}
          {/* On mobile: full-width card on top. On desktop: narrow left column. */}
          <div className="w-full md:w-52 md:shrink-0">
            <Card className="p-4 rounded-2xl shadow-md flex flex-col gap-3 md:gap-4">

              {/* Logo + name row on mobile (inline), stacked on desktop */}
              <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-3">
                {/* Logo */}
                <div
                  className="relative w-20 h-20 md:w-28 md:h-28 rounded-2xl border-4 border-background bg-white overflow-hidden shadow-lg cursor-pointer group shrink-0"
                  onClick={() => logoInputRef.current?.click()}
                >
                  {store?.logoUrl ? (
                    <img src={store.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-100">
                      <Store className="w-8 h-8 md:w-10 md:h-10 text-slate-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                </div>

                {/* Name & store */}
                <div>
                  <h2 className="font-bold text-base md:text-lg leading-tight">{user?.username}</h2>
                  <p className="text-muted-foreground text-sm">@{store?.name ?? user?.username}</p>
                  {/* Badges */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <Badge className="text-xs px-2 py-0.5" style={{ backgroundColor: "#1e3a5f", color: "white" }}>
                      Plan : {planLabel}
                    </Badge>
                    <Badge className="text-xs px-2 py-0.5 bg-green-500 hover:bg-green-500 text-white">Actif</Badge>
                  </div>
                </div>
              </div>

              {/* Upgrade button */}
              <Button size="sm" className="w-full text-sm font-semibold" style={{ backgroundColor: GOLD, color: "white" }}>
                <TrendingUp className="w-3.5 h-3.5 mr-1" /> Upgrade
              </Button>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground leading-tight uppercase tracking-wide">Boutiques</p>
                  <p className="font-bold text-sm">{sub?.storeCount ?? 1}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground leading-tight uppercase tracking-wide">Équipe</p>
                  <p className="font-bold text-sm">{sub?.teamCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground leading-tight uppercase tracking-wide">Cdes</p>
                  <p className="font-bold text-sm">{monthlyOrders}</p>
                </div>
              </div>

              {/* Usage progress */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Utilisation</span>
                  <span>{usagePct}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${usagePct}%`, backgroundColor: usagePct >= 80 ? "#ef4444" : "#22c55e" }}
                  />
                </div>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">Boutiques : ok</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">Équipe : ok</span>
                </div>
              </div>
            </Card>
          </div>

          {/* ── Main content (Tabs + Forms) ──────────────────────────────── */}
          <div className="flex-1 min-w-0 mt-4 md:mt-0 md:pt-12">

            {/* ── Tabs navigation (horizontally scrollable on mobile) ────── */}
            <div
              className="flex overflow-x-auto border-b mb-5 gap-0 scrollbar-hide"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    data-testid={`tab-${tab.id}`}
                    className={`flex items-center gap-1.5 px-3 md:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
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

            {/* ── Tab: Profil ───────────────────────────────────────────── */}
            {activeTab === "profil" && (
              <>
              <Card className="p-4 md:p-6 rounded-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-base">Nom complet</Label>
                    <Input
                      data-testid="input-username"
                      className="w-full text-base"
                      value={profil.username}
                      onChange={e => setProfil(p => ({ ...p, username: e.target.value }))}
                      placeholder="Votre nom"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base">Numéro de téléphone</Label>
                    <Input
                      data-testid="input-phone"
                      className="w-full text-base"
                      value={profil.phone}
                      onChange={e => setProfil(p => ({ ...p, phone: e.target.value }))}
                      placeholder="+212600000000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base">Email</Label>
                    <Input
                      data-testid="input-email"
                      className="w-full text-base"
                      type="email"
                      value={profil.email}
                      onChange={e => setProfil(p => ({ ...p, email: e.target.value }))}
                      placeholder="email@exemple.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base">Date d'enregistrement</Label>
                    <Input
                      disabled
                      className="w-full text-base bg-muted"
                      value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-MA') : "—"}
                    />
                  </div>
                </div>
                <SaveBtn
                  pending={updateProfil.isPending}
                  onClick={() => updateProfil.mutate({ username: profil.username, email: profil.email || null, phone: profil.phone || null })}
                />
              </Card>

              {/* ── Sound notifications ───────────────────────────────── */}
              <Card className="p-4 md:p-6 rounded-2xl mt-4">
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm">🔔 Notifications sonores</h3>

                  <div className="flex items-center justify-between">
                    <label className="text-sm">Son pour nouvelle commande</label>
                    <Switch
                      data-testid="switch-sound-enabled"
                      checked={pendingSoundEnabled}
                      onCheckedChange={v => setPendingSoundEnabled(v)}
                    />
                  </div>

                  {pendingSoundEnabled && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Choisir un son :</p>
                      {SOUNDS.map(s => (
                        <div
                          key={s.id}
                          data-testid={`sound-option-${s.id}`}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                            pendingSound === s.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/40"
                          )}
                          onClick={() => setPendingSound(s.id)}
                        >
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-3 h-3 rounded-full border-2",
                              pendingSound === s.id ? "border-primary bg-primary" : "border-muted-foreground"
                            )} />
                            <span className="text-sm font-medium">{s.label}</span>
                          </div>
                          <button
                            type="button"
                            data-testid={`button-test-sound-${s.id}`}
                            className="text-xs text-primary font-semibold px-3 py-1 rounded-lg hover:bg-primary/10 border border-primary/30"
                            onClick={e => { e.stopPropagation(); testSound(s.id); }}
                          >
                            ▶ Tester
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    data-testid="button-save-sound"
                    className="w-full py-2.5 rounded-xl bg-primary text-white font-semibold text-sm mt-2"
                    onClick={saveSoundSettings}
                  >
                    {soundSaved ? '✅ Enregistré !' : 'Enregistrer les préférences'}
                  </button>
                </div>
              </Card>
              </>
            )}

            {/* ── Tab: Réseaux ──────────────────────────────────────────── */}
            {activeTab === "reseaux" && (
              <Card className="p-4 md:p-6 rounded-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-base">Site web</Label>
                    <Input
                      data-testid="input-website"
                      className="w-full text-base"
                      value={social.website}
                      onChange={e => setSocial(s => ({ ...s, website: e.target.value }))}
                      placeholder="https://votre-boutique.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base">Facebook</Label>
                    <Input
                      data-testid="input-facebook"
                      className="w-full text-base"
                      value={social.facebook}
                      onChange={e => setSocial(s => ({ ...s, facebook: e.target.value }))}
                      placeholder="https://facebook.com/yourprofile"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base">Instagram</Label>
                    <Input
                      data-testid="input-instagram"
                      className="w-full text-base"
                      value={social.instagram}
                      onChange={e => setSocial(s => ({ ...s, instagram: e.target.value }))}
                      placeholder="https://instagram.com/yourprofile"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base">Autre réseau</Label>
                    <Input
                      data-testid="input-other-social"
                      className="w-full text-base"
                      value={social.otherSocial}
                      onChange={e => setSocial(s => ({ ...s, otherSocial: e.target.value }))}
                      placeholder="Entrez un autre réseau"
                    />
                  </div>
                </div>
                <SaveBtn
                  pending={updateSocial.isPending}
                  onClick={() => updateSocial.mutate(social)}
                />
              </Card>
            )}

            {/* ── Tab: WhatsApp ─────────────────────────────────────────── */}
            {activeTab === "whatsapp" && (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between p-4 rounded-xl text-white" style={{ background: "linear-gradient(135deg, #25d366, #128c7e)" }}>
                  <div className="flex items-center gap-2 font-semibold text-base md:text-lg">
                    <MessageCircle className="w-5 h-5" />
                    Modèles de messages WhatsApp
                  </div>
                  <Badge className="bg-white/20 text-white border-white/30 shrink-0">Pro</Badge>
                </div>

                {/* Sub-tabs (scrollable) */}
                <div
                  className="flex gap-2 overflow-x-auto pb-1"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {WA_TABS.map((wt, i) => (
                    <button
                      key={wt}
                      data-testid={`wa-tab-${i}`}
                      onClick={() => setWaTab(i)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                        waTab === i ? "bg-[#25d366] text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {i === 0 ? <MessageCircle className="w-3.5 h-3.5" /> : i === 1 ? <Zap className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      {wt}
                    </button>
                  ))}
                </div>

                <Card className="p-4 rounded-2xl space-y-4">
                  <h3 className="font-semibold flex items-center gap-2 text-[#25d366] text-base">
                    <MessageCircle className="w-4 h-4" />
                    {["Message de Bienvenue", "Message Personnalisé", "Après Expédition"][waTab]}
                  </h3>

                  {/*
                    MOBILE: preview first, editor below (flex-col-reverse on ≥md shows editor first).
                    So we use flex-col on mobile (preview on top) and keep them stacked.
                  */}
                  <div className="flex flex-col gap-4">

                    {/* Preview bubble — shown FIRST on mobile */}
                    <div className="rounded-xl p-4 bg-[#ece5dd] dark:bg-slate-800 order-first">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-[#25d366] flex items-center justify-center shrink-0">
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

                    {/* Editor — below preview on mobile, above on desktop (via md:order-first) */}
                    <div className="space-y-2 md:order-first">
                      <Label className="text-base">Modifier le message</Label>
                      <Textarea
                        data-testid={`wa-editor-${waTab}`}
                        value={currentWaValue}
                        onChange={e => setCurrentWa(e.target.value)}
                        rows={6}
                        placeholder="Votre message WhatsApp..."
                        className="font-mono text-sm resize-none w-full"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      data-testid={`wa-enabled-${waTab}`}
                      checked={currentWaEnabled}
                      onCheckedChange={v => setCurrentWaEnabled(v)}
                    />
                    <Label className="text-base">Activer ce modèle</Label>
                  </div>

                  {/* Variables */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5 text-base">
                      <Zap className="w-3.5 h-3.5" style={{ color: GOLD }} />
                      Variables disponibles:
                    </Label>
                    <p className="text-xs text-muted-foreground">Cliquez pour ajouter au message</p>
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
                      className="w-full md:w-auto"
                      style={{ backgroundColor: "#25d366", color: "white" }}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {updateWa.isPending ? "Enregistrement..." : "Sauvegarder les templates"}
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* ── Tab: Abonnement ───────────────────────────────────────── */}
            {activeTab === "abonnement" && (
              <Card className="p-4 md:p-6 rounded-2xl">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
                  <div>
                    <h3 className="font-bold text-lg">Plan actuel : {planLabel}</h3>
                    {sub?.billingCycleStart && (
                      <p className="text-sm text-muted-foreground">
                        Du {new Date(sub.billingCycleStart).toLocaleDateString('fr-MA')} au{" "}
                        {new Date(new Date(sub.billingCycleStart).setMonth(new Date(sub.billingCycleStart).getMonth() + 1)).toLocaleDateString('fr-MA')}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" className="w-full md:w-auto" style={{ borderColor: GOLD, color: GOLD }}>
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Changer / Mettre à niveau
                  </Button>
                </div>

                {/* Responsive table — scrollable on mobile */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[400px]">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-semibold">Mois</th>
                        <th className="text-left py-2 font-semibold">Commandes</th>
                        <th className="text-left py-2 font-semibold">Boutiques</th>
                        <th className="text-left py-2 font-semibold">Équipe</th>
                        <th className="text-left py-2 font-semibold">Dernière MàJ</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-3" data-testid="text-sub-month">{sub?.month}</td>
                        <td className="py-3" data-testid="text-sub-orders">{sub?.currentMonthOrders ?? 0}</td>
                        <td className="py-3" data-testid="text-sub-stores">{sub?.storeCount ?? 1}</td>
                        <td className="py-3" data-testid="text-sub-team">{sub?.teamCount ?? 0}</td>
                        <td className="py-3 text-muted-foreground text-xs">
                          {sub?.billingCycleStart ? new Date(sub.billingCycleStart).toLocaleString('fr-MA') : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

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

            {/* ── Tab: Sécurité ─────────────────────────────────────────── */}
            {activeTab === "securite" && (
              <Card className="p-4 md:p-6 rounded-2xl space-y-4">
                <div className="space-y-2">
                  <Label className="text-base">Mot de Passe Actuel</Label>
                  <Input
                    data-testid="input-current-password"
                    type="password"
                    className="w-full text-base"
                    value={pwd.currentPassword}
                    onChange={e => setPwd(p => ({ ...p, currentPassword: e.target.value }))}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-base">Nouveau Mot de Passe</Label>
                  <Input
                    data-testid="input-new-password"
                    type="password"
                    className="w-full text-base"
                    value={pwd.newPassword}
                    onChange={e => setPwd(p => ({ ...p, newPassword: e.target.value }))}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-base">Confirmer le Nouveau Mot de Passe</Label>
                  <Input
                    data-testid="input-confirm-password"
                    type="password"
                    className="w-full text-base"
                    value={pwd.confirm}
                    onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))}
                    placeholder="••••••••"
                  />
                </div>
                <div className="flex justify-end mt-4">
                  <Button
                    data-testid="button-save-password"
                    disabled={updatePwd.isPending}
                    className="w-full md:w-auto"
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
