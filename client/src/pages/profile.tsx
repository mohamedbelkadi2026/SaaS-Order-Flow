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
  Camera, TrendingUp, Store, Zap, Lock, Save, CheckCircle, Bell, Smartphone, BellOff,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

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
  { id: "notifications", label: "Notifications", icon: Bell },
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
          const masterGain = ctx.createGain();
          masterGain.connect(ctx.destination);
          masterGain.gain.value = 0.7;

          // === "KA" part — mechanical click + spring ===
          const clickBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.015), ctx.sampleRate);
          const clickData = clickBuf.getChannelData(0);
          for (let i = 0; i < clickData.length; i++) {
            clickData[i] = (Math.random() * 2 - 1) * (1 - i / clickData.length);
          }
          const click = ctx.createBufferSource();
          click.buffer = clickBuf;
          const clickFilter = ctx.createBiquadFilter();
          clickFilter.type = 'highpass';
          clickFilter.frequency.value = 800;
          click.connect(clickFilter);
          clickFilter.connect(masterGain);
          click.start(ctx.currentTime);

          const swoosh = ctx.createOscillator();
          const swooshGain = ctx.createGain();
          swoosh.connect(swooshGain);
          swooshGain.connect(masterGain);
          swoosh.type = 'sawtooth';
          swoosh.frequency.setValueAtTime(400, ctx.currentTime);
          swoosh.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.08);
          swooshGain.gain.setValueAtTime(0.25, ctx.currentTime);
          swooshGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
          swoosh.start(ctx.currentTime);
          swoosh.stop(ctx.currentTime + 0.08);

          // === "CHING" part — bright metallic bell ===
          const t = ctx.currentTime + 0.07;
          [2637, 3136, 3951, 5274].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(masterGain);
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.35 / (i + 1), t + i * 0.005);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2 - i * 0.1);
            osc.start(t + i * 0.005);
            osc.stop(t + 1.2);
          });

          // Shimmer — high frequency sparkle
          [6000, 7500, 9000].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(masterGain);
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.08, t + i * 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            osc.start(t + i * 0.01);
            osc.stop(t + 0.4);
          });

          // Low resonance body
          const body = ctx.createOscillator();
          const bodyGain = ctx.createGain();
          body.connect(bodyGain);
          bodyGain.connect(masterGain);
          body.type = 'sine';
          body.frequency.value = 523;
          bodyGain.gain.setValueAtTime(0.15, t);
          bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
          body.start(t);
          body.stop(t + 0.6);

          setTimeout(() => ctx.close(), 3000);
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

  const soundUserId = (user as any)?.id || 'guest';
  const [pendingSoundEnabled, setPendingSoundEnabled] = useState(
    () => localStorage.getItem(`notif_sound_enabled_${soundUserId}`) !== 'false'
  );
  const [pendingSound, setPendingSound] = useState(
    () => localStorage.getItem(`notif_sound_id_${soundUserId}`) || 'cash'
  );
  const [soundSaved, setSoundSaved] = useState(false);

  useEffect(() => {
    const uid = (user as any)?.id || 'guest';
    setPendingSound(localStorage.getItem(`notif_sound_id_${uid}`) || 'cash');
    setPendingSoundEnabled(localStorage.getItem(`notif_sound_enabled_${uid}`) !== 'false');
  }, [(user as any)?.id]);

  const saveSoundSettings = () => {
    const uid = (user as any)?.id || 'guest';
    localStorage.setItem(`notif_sound_id_${uid}`, pendingSound);
    localStorage.setItem(`notif_sound_enabled_${uid}`, String(pendingSoundEnabled));
    setSoundSaved(true);
    setTimeout(() => setSoundSaved(false), 2000);
  };

  const testSound = (id: string) => {
    playTone(id);
  };

  // ── Push notifications ────────────────────────────────────────────────────────
  const { permission, subscribed, loading: pushLoading, error: pushError, isSupported, isIOS, isPWA, subscribe, unsubscribe } = usePushNotifications();
  const [testResult, setTestResult] = useState<any>(null);
  const sendTestPush = useMutation({
    mutationFn: () => apiRequest("POST", "/api/push/test", {}),
    onSuccess: (data: any) => {
      setTestResult(data);
      if (data.sent > 0) {
        toast({ title: "Notification de test envoyée ✅", description: `${data.sent} appareil(s) notifié(s)` });
      } else {
        toast({ title: "Envoi échoué", description: "Vérifiez les détails ci-dessous.", variant: "destructive" });
      }
    },
    onError: (e: any) => {
      setTestResult(null);
      toast({ title: "Erreur test push", description: e.message, variant: "destructive" });
    },
  });
  const [notifSettings, setNotifSettings] = useState<{
    newOrder: boolean; statusUpdate: boolean; importantOnly: boolean;
  }>({
    newOrder:     (user as any)?.notifSettings?.newOrder     !== false,
    statusUpdate: (user as any)?.notifSettings?.statusUpdate !== false,
    importantOnly:(user as any)?.notifSettings?.importantOnly!== false,
  });
  const saveNotifSettings = useMutation({
    mutationFn: (data: typeof notifSettings) => apiRequest("PUT", "/api/user/notification-settings", data),
    onSuccess: () => toast({ title: "Préférences de notifications sauvegardées" }),
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

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

            {/* ── Tab: Notifications ───────────────────────────────────── */}
            {activeTab === "notifications" && (
              <div className="space-y-4">

                {/* Push subscription card */}
                <Card className="p-4 md:p-6 rounded-2xl">
                  <div className="flex items-center gap-2 mb-4">
                    <Bell className="w-4 h-4" style={{ color: GOLD }} />
                    <h3 className="font-semibold text-sm">Notifications Push (PWA)</h3>
                  </div>

                  {/* iOS not in PWA warning */}
                  {isIOS && !isPWA && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 mb-4">
                      <Smartphone className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">iPhone / iPad</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                          Les notifications Push nécessitent iOS 16.4+ et que l'app soit installée depuis Safari (
                          <span className="font-semibold">Partager → Sur l'écran d'accueil</span>).
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Not supported */}
                  {!isSupported && !(isIOS && !isPWA) && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted mb-4">
                      <BellOff className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">
                        Les notifications Push ne sont pas disponibles dans ce navigateur.
                      </p>
                    </div>
                  )}

                  {isSupported && (
                    <div className="space-y-3">
                      {/* Permission status */}
                      <div className="flex items-center gap-2 text-sm">
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full",
                          permission === "granted" ? "bg-green-500" : permission === "denied" ? "bg-red-500" : "bg-amber-500"
                        )} />
                        <span className="text-muted-foreground">
                          {permission === "granted" ? "Permission accordée" : permission === "denied" ? "Permission refusée (à réactiver dans les paramètres navigateur)" : "Permission non encore demandée"}
                        </span>
                      </div>

                      {permission === "denied" && (
                        <p className="text-xs text-destructive">
                          Vous avez bloqué les notifications. Activez-les dans les paramètres du navigateur puis rechargez la page.
                        </p>
                      )}

                      {/* Subscribe / unsubscribe row */}
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <p className="text-sm font-medium">Recevoir des notifications</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {subscribed ? "Cet appareil est inscrit ✅" : "Cet appareil n'est pas inscrit"}
                          </p>
                        </div>
                        <Button
                          data-testid="button-toggle-push"
                          size="sm"
                          disabled={pushLoading || permission === "denied"}
                          onClick={async () => {
                            if (subscribed) {
                              await unsubscribe();
                            } else {
                              const ok = await subscribe();
                              if (!ok) {
                                toast({
                                  title: "Erreur d'inscription",
                                  description: pushError || "Impossible d'activer les notifications.",
                                  variant: "destructive",
                                });
                              }
                            }
                          }}
                          variant={subscribed ? "outline" : "default"}
                          style={!subscribed ? { backgroundColor: GOLD, color: "white" } : {}}
                        >
                          {pushLoading ? "..." : subscribed ? "Désactiver" : "Activer"}
                        </Button>
                      </div>

                      {/* Inline error display */}
                      {pushError && (
                        <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
                          {pushError}
                        </p>
                      )}

                      {/* Test notification button — only shown when subscribed */}
                      {subscribed && (
                        <div className="pt-1 border-t border-border space-y-3">
                          <Button
                            data-testid="button-test-push"
                            size="sm"
                            variant="outline"
                            disabled={sendTestPush.isPending}
                            onClick={() => { setTestResult(null); sendTestPush.mutate(); }}
                            className="w-full"
                          >
                            <Bell className="w-3.5 h-3.5 mr-2" />
                            {sendTestPush.isPending ? "Envoi en cours..." : "Envoyer une notification de test"}
                          </Button>

                          {/* Per-subscription diagnostic result */}
                          {testResult && (
                            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-xs font-mono">
                              <div className="flex gap-2 flex-wrap">
                                <span className="text-muted-foreground">abonnements:</span>
                                <span className="font-semibold">{testResult.subscriptions ?? 0}</span>
                                <span className="text-muted-foreground ml-2">envoyés:</span>
                                <span className={cn("font-semibold", testResult.sent > 0 ? "text-green-600 dark:text-green-400" : "text-destructive")}>
                                  {testResult.sent ?? 0}
                                </span>
                              </div>
                              <div className="text-muted-foreground">
                                VAPID key: <span className="text-foreground">{testResult.vapidPublicKeyPrefix ?? "—"}</span>
                              </div>
                              <div className="text-muted-foreground break-all">
                                subject: <span className="text-foreground">{testResult.vapidSubject ?? "—"}</span>
                              </div>
                              {(testResult.results ?? []).map((r: any, i: number) => (
                                <div key={i} className={cn(
                                  "rounded p-2 space-y-0.5",
                                  r.error ? "bg-destructive/10 border border-destructive/30" : "bg-green-500/10 border border-green-500/30"
                                )}>
                                  <div className="flex gap-2 items-center">
                                    <span className={r.error ? "text-destructive" : "text-green-600 dark:text-green-400"}>
                                      {r.error ? "❌" : "✅"}
                                    </span>
                                    <span className="font-semibold">{r.host}</span>
                                    <span className="text-muted-foreground">…{r.endpointTail}</span>
                                    {r.statusCode && <span className="ml-auto text-muted-foreground">HTTP {r.statusCode}</span>}
                                  </div>
                                  {r.error && <div className="text-destructive break-all">{r.error}</div>}
                                  {r.body   && <div className="text-muted-foreground break-all">{r.body}</div>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>

                {/* Notification preference toggles */}
                <Card className="p-4 md:p-6 rounded-2xl">
                  <h3 className="font-semibold text-sm mb-4">⚙️ Préférences de notifications</h3>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Nouvelle commande</p>
                        <p className="text-xs text-muted-foreground">Notifier à chaque nouvelle commande reçue</p>
                      </div>
                      <Switch
                        data-testid="switch-notif-new-order"
                        checked={notifSettings.newOrder}
                        onCheckedChange={v => setNotifSettings(s => ({ ...s, newOrder: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Mise à jour de statut</p>
                        <p className="text-xs text-muted-foreground">Notifier lors d'un changement de statut</p>
                      </div>
                      <Switch
                        data-testid="switch-notif-status-update"
                        checked={notifSettings.statusUpdate}
                        onCheckedChange={v => setNotifSettings(s => ({ ...s, statusUpdate: v }))}
                      />
                    </div>

                    {notifSettings.statusUpdate && (
                      <div className="flex items-center justify-between pl-4 border-l-2 border-muted">
                        <div>
                          <p className="text-sm font-medium">Statuts importants uniquement</p>
                          <p className="text-xs text-muted-foreground">Confirmé, Livré, Refusé, Retourné, Annulé</p>
                        </div>
                        <Switch
                          data-testid="switch-notif-important-only"
                          checked={notifSettings.importantOnly}
                          onCheckedChange={v => setNotifSettings(s => ({ ...s, importantOnly: v }))}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end mt-5">
                    <Button
                      data-testid="button-save-notif-settings"
                      disabled={saveNotifSettings.isPending}
                      onClick={() => saveNotifSettings.mutate(notifSettings)}
                      className="w-full md:w-auto"
                      style={{ backgroundColor: GOLD, color: "white" }}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {saveNotifSettings.isPending ? "Enregistrement..." : "Sauvegarder"}
                    </Button>
                  </div>
                </Card>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
