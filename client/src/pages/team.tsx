import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAgents, useCreateAgent, useAgentPerformance, useDeleteAgent, useProducts, useAgentProducts, useSetAgentProducts, useAgentStoreSettings, useMagasins, useAgentMagasinPercentages, useUpsertAgentMagasinPercentages } from "@/hooks/use-store-data";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, ShoppingBag, CheckCircle, Truck, Activity, Trash2, Package, X, Save, Loader2, Search, MapPin, Percent, ShieldCheck, Pencil, Link2, TrendingUp, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

const DEFAULT_PERMISSIONS: Record<string, boolean> = {
  show_store_orders: false,
  show_revenue: false,
  show_profit: false,
  show_charts: false,
  show_top_products: false,
  show_inventory: false,
  show_all_orders: false,
};

const PERMISSION_LABELS: Record<string, { label: string; description: string }> = {
  show_store_orders: { label: "Commandes globales de la boutique", description: "Voir toutes les commandes, pas seulement les siennes" },
  show_revenue: { label: "Chiffre d'affaires & ROI", description: "Voir les stats de revenus, ROAS et dépenses publicitaires" },
  show_profit: { label: "Profit Net", description: "Voir les bénéfices nets — données très sensibles" },
  show_charts: { label: "Graphiques & Analyses", description: "Voir les graphiques de ventes et les courbes de statuts" },
  show_top_products: { label: "Table Produits Commandés", description: "Voir quels produits se vendent le mieux" },
  show_inventory: { label: "Accès au Stock / Inventaire", description: "Voir et gérer les niveaux de stock" },
  show_all_orders: { label: "Page Commandes (Toutes)", description: "Accéder à la vue centrale de toutes les commandes" },
};

const MOROCCAN_REGIONS = [
  { value: "tanger", label: "Région Tanger-Tétouan-Al Hoceima" },
  { value: "oriental", label: "Région de l'Oriental" },
  { value: "fes-meknes", label: "Région Fès-Meknès" },
  { value: "rabat", label: "Région Rabat-Salé-Kénitra" },
  { value: "beni-mellal", label: "Région Béni Mellal-Khénifra" },
  { value: "casablanca", label: "Région Casablanca-Settat" },
  { value: "marrakech", label: "Région Marrakech-Safi" },
  { value: "draa", label: "Région Drâa-Tafilalet" },
  { value: "souss", label: "Région Souss-Massa" },
  { value: "guelmim", label: "Région Guelmim-Oued Noun" },
  { value: "laayoune", label: "Région Laâyoune-Sakia El Hamra" },
  { value: "dakhla", label: "Région Dakhla-Oued Ed-Dahab" },
];

// Preview of cities per region. Mirrors server/storage.ts REGION_CITY_MAP for
// UX only — the actual city → region matching happens server-side. Keep the
// two lists in sync if you add new cities to a region.
const REGION_PREVIEW: Record<string, string[]> = {
  tanger: ['Tanger', 'Tétouan', 'Al Hoceima', 'Chefchaouen', 'Larache', 'Ouazzane', 'Mdiq', 'Fnideq'],
  oriental: ['Oujda', 'Nador', 'Berkane', 'Taourirt', 'Jerada', 'Guercif', 'Figuig'],
  'fes-meknes': ['Fès', 'Meknès', 'Ifrane', 'Taza', 'Sefrou', 'Boulemane', 'El Hajeb'],
  rabat: ['Rabat', 'Salé', 'Kénitra', 'Skhirat', 'Témara', 'Khémisset'],
  'beni-mellal': ['Béni Mellal', 'Khénifra', 'Azilal', 'Khouribga', 'Fquih Ben Salah', 'Kasba Tadla'],
  casablanca: ['Casablanca', 'Settat', 'Mohammedia', 'Benslimane', 'El Jadida', 'Berrechid', 'Mediouna', 'Nouaceur'],
  marrakech: ['Marrakech', 'Safi', 'Essaouira', 'Chichaoua', 'Al Haouz', 'Kelaâ', 'Youssoufia'],
  draa: ['Errachidia', 'Ouarzazate', 'Midelt', 'Tinghir', 'Zagora'],
  souss: ['Agadir', 'Tiznit', 'Taroudant', 'Chtouka', 'Inezgane', 'Aït Melloul', 'Tata'],
  guelmim: ['Guelmim', 'Tan-Tan', 'Sidi Ifni', 'Assa', 'Zag'],
  laayoune: ['Laâyoune', 'Boujdour', 'Smara', 'Tarfaya'],
  dakhla: ['Dakhla', 'Aousserd', 'Oued Dahab'],
};

const ROLE_LABELS: Record<string, string> = {
  confirmation: "Confirmation",
  suivi: "Suivi",
  both: "Les deux",
};

const DIST_METHOD_TABS = ["auto", "pourcentage", "produit", "region"] as const;
type DistMethod = typeof DIST_METHOD_TABS[number];

const defaultForm = {
  username: "",
  phone: "",
  email: "",
  password: "",
  paymentType: "commission",
  paymentAmount: "",
  distributionMethod: "auto" as DistMethod,
  roleInStore: "confirmation",
  isActive: true,
  leadPercentage: "50",
  allowedProductIds: [] as number[],
  allowedRegions: [] as string[],
  commissionRate: "",
  memberType: "agent" as "agent" | "media_buyer",
  buyerCode: "",
  percentagesByMagasin: {} as Record<number, number>,
};

// Per-magasin lead percentage grid for the agent edit modal.
// Loads existing per-magasin rows on mount, seeds the parent state once, and
// shows a column-validity hint (each magasin's column must sum to ~100%).
function PerMagasinPercentageGrid({
  agentId, magasins, values, onChange,
}: {
  agentId: number;
  magasins: any[];
  values: Record<number, number>;
  onChange: (next: Record<number, number>) => void;
}) {
  const { data: existing = [], isLoading } = useAgentMagasinPercentages(agentId);
  const { data: agentSettings = [] } = useAgentStoreSettings();
  const { data: agents = [] } = useAgents();

  // Magasins this agent is linked to (per stores.agentIds). If a magasin's
  // agentIds is empty, fall back to "all account agents" — matches getNextAgent.
  const linkedMagasins = (magasins || []).filter((m: any) => {
    const ids: number[] = Array.isArray(m.agentIds) ? m.agentIds.map(Number) : [];
    return ids.length === 0 || ids.includes(agentId);
  });

  // One-shot: seed the controlled state from the server response the first
  // time it loads (only if the parent hasn't been touched yet).
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || isLoading) return;
    const seed: Record<number, number> = {};
    for (const row of existing) seed[row.magasinId] = row.leadPercentage;
    onChange({ ...seed, ...values });
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, existing, seeded]);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Chargement…</p>;
  }
  if (linkedMagasins.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Cet agent n'est lié à aucun magasin. Liez-le depuis la page Magasins pour configurer ses pourcentages.
      </p>
    );
  }

  // For each magasin, compute the sum of percentages of all agents linked to
  // that magasin (using the new per-magasin row when available, falling back
  // to the legacy account-wide leadPercentage in agentSettings).
  const otherAgentSettings = (agentSettings as any[]).filter((s: any) => s.agentId !== agentId);

  return (
    <div className="space-y-3" data-testid="grid-magasin-percentages">
      <p className="text-xs text-muted-foreground">
        Définissez le poids relatif de cet agent par magasin. Les pourcentages
        sont des <strong>ratios</strong> — pas besoin que la somme fasse
        exactement 100%. Si trois agents ont 70 / 15 / 15, le premier reçoit
        70% des leads. Si vous mettez 5 / 2 / 2, c'est exactement la même
        répartition (50% / 20% / 20%). Mettez 0 pour exclure l'agent de ce magasin.
      </p>
      <div className="grid gap-2">
        {linkedMagasins.map((m: any) => {
          const linkedAgentIds: number[] = Array.isArray(m.agentIds) ? m.agentIds.map(Number) : [];
          const eligibleAgents = (agents || []).filter((a: any) => {
            if (a.role !== 'agent') return false;
            if (linkedAgentIds.length === 0) return true;
            return linkedAgentIds.includes(a.id);
          });
          const otherSum = eligibleAgents
            .filter((a: any) => a.id !== agentId)
            .reduce((sum: number, a: any) => {
              const setting = otherAgentSettings.find((s: any) => s.agentId === a.id);
              return sum + (setting?.leadPercentage || 0);
            }, 0);
          const me = Number(values[m.id] ?? 0);
          const total = otherSum + me;
          // Show the agent's TRUE share after normalization — much friendlier
          // than scolding the user for not totaling 100. Engine normalizes anyway.
          const sharePct = total > 0 ? Math.round((me / total) * 100) : 0;
          return (
            <div
              key={m.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-background"
              data-testid={`row-magasin-pct-${m.id}`}
            >
              <span className="flex-1 text-sm font-medium truncate">{m.name || `Magasin #${m.id}`}</span>
              <Input
                type="number"
                min="0"
                max="100"
                value={String(values[m.id] ?? "")}
                placeholder="0"
                onChange={e => {
                  const v = e.target.value === "" ? 0 : Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                  onChange({ ...values, [m.id]: v });
                }}
                className="w-20 h-9 text-right"
                data-testid={`input-magasin-pct-${m.id}`}
              />
              <span className="text-xs text-muted-foreground w-6">%</span>
              <span
                className={cn(
                  "text-[11px] font-semibold w-36 text-right tabular-nums",
                  total > 0 ? "text-muted-foreground" : "text-orange-600"
                )}
                data-testid={`text-magasin-pct-total-${m.id}`}
              >
                {total > 0
                  ? `Part de cet agent: ${sharePct}%`
                  : "Aucun agent configuré"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MultiSelectDropdown({
  label, search, setSearch, items, selected, onToggle, renderItem, noItemsText,
}: {
  label: string;
  search: string;
  setSearch: (v: string) => void;
  items: any[];
  selected: (string | number)[];
  onToggle: (id: string | number) => void;
  renderItem: (item: any) => { id: string | number; label: string; sublabel?: string };
  noItemsText: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = items.filter(item => {
    const { label: l } = renderItem(item);
    return l.toLowerCase().includes(search.toLowerCase());
  });
  const selectedItems = items.filter(item => {
    const { id } = renderItem(item);
    return selected.includes(id);
  });

  return (
    <div className="relative">
      <div
        className="flex items-center min-h-[44px] flex-wrap gap-1.5 px-3 py-2 border rounded-lg bg-background cursor-text"
        onClick={() => setOpen(true)}
      >
        {selectedItems.length > 0 ? selectedItems.map(item => {
          const { id, label: l } = renderItem(item);
          return (
            <Badge key={id} variant="secondary" className="text-xs gap-1 pr-1">
              {l}
              <button type="button" onClick={e => { e.stopPropagation(); onToggle(id); }} className="ml-0.5 hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          );
        }) : (
          <span className="text-muted-foreground text-sm">{label}</span>
        )}
        <Input
          className="border-none shadow-none p-0 h-5 flex-1 min-w-[80px] focus-visible:ring-0 text-sm"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selectedItems.length > 0 ? "" : ""}
        />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-card border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{noItemsText}</p>
            ) : filtered.map(item => {
              const { id, label: l, sublabel } = renderItem(item);
              const isChecked = selected.includes(id);
              return (
                <label key={id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={isChecked} onCheckedChange={() => onToggle(id)} />
                  <div>
                    <span className="text-sm font-medium">{l}</span>
                    {sublabel && <span className="text-xs text-muted-foreground ml-2">{sublabel}</span>}
                  </div>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function MediaBuyersSummaryTable() {
  const { data: buyers, isLoading } = useQuery<any[]>({ queryKey: ['/api/media-buyers/summary'] });
  if (isLoading) return null;
  if (!buyers || buyers.length === 0) return null;

  return (
    <div className="space-y-3 mt-2">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-violet-600" />
        </div>
        <h2 className="text-lg font-bold">Performance Media Buyers</h2>
      </div>
      <Table className="bg-card rounded-2xl border overflow-hidden">
        <TableHeader className="bg-violet-50/50 dark:bg-violet-900/10">
          <TableRow>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Nom</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Code</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Total Leads</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Confirmés</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Livrés</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Taux Confirm.</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider">Revenue Généré</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buyers.map((buyer: any) => (
            <TableRow key={buyer.id} className="hover:bg-muted/5">
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="w-7 h-7">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${buyer.username}`} />
                    <AvatarFallback className="text-[10px]">{buyer.username?.[0]}</AvatarFallback>
                  </Avatar>
                  <span className="font-semibold text-sm">{buyer.username}</span>
                </div>
              </TableCell>
              <TableCell>
                {buyer.buyerCode ? (
                  <Badge className="bg-violet-100 text-violet-700 border-violet-200 font-mono text-xs">#{buyer.buyerCode}</Badge>
                ) : <span className="text-muted-foreground text-xs">—</span>}
              </TableCell>
              <TableCell><span className="font-semibold">{buyer.total}</span></TableCell>
              <TableCell>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">{buyer.confirmed}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">{buyer.delivered}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("text-xs", buyer.confirmRate >= 50 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200")}>
                  {buyer.confirmRate}%
                </Badge>
              </TableCell>
              <TableCell className="font-semibold text-emerald-600">{formatCurrency(buyer.revenue)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Team() {
  const { data: agents, isLoading } = useAgents();
  const { data: products } = useProducts();
  const { data: agentSettings = [] } = useAgentStoreSettings();
  const { data: magasins = [] } = useMagasins();
  // ── "Actions du jour" filter state ──────────────────────────────────────
  // Default: today, all magasins. The owner can narrow to one magasin or
  // pick another date to audit a specific day's work. The hook re-fetches
  // automatically on change because both values are part of the query key.
  const todayStr = new Date().toISOString().slice(0, 10);
  const [perfDate, setPerfDate] = useState<string>(todayStr);
  const [perfMagasinId, setPerfMagasinId] = useState<string>("all");
  const { data: performance } = useAgentPerformance(
    perfMagasinId === "all" ? null : Number(perfMagasinId),
    perfDate,
  );

  // When the owner narrows by magasin, also narrow the agents table to those
  // who actually have a settings row for that magasin. Otherwise the filter
  // would update the "Traitées" column to zero for every agent who isn't in
  // that magasin, which is misleading — better to hide them entirely.
  const visibleAgents = useMemo(() => {
    if (!agents) return [];
    if (perfMagasinId === "all") return agents;
    const magasinId = Number(perfMagasinId);
    return agents.filter((a: any) =>
      (agentSettings || []).some((s: any) => s.agentId === a.id && s.magasinId === magasinId)
    );
  }, [agents, agentSettings, perfMagasinId]);
  const createAgent = useCreateAgent();
  const upsertAgentPercentages = useUpsertAgentMagasinPercentages();
  const deleteAgent = useDeleteAgent();
  const setAgentProducts = useSetAgentProducts();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ ...defaultForm });
  const [productDialogAgent, setProductDialogAgent] = useState<any>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [formData, setFormData] = useState({ ...defaultForm });
  const [productSearch, setProductSearch] = useState("");
  const [regionSearch, setRegionSearch] = useState("");
  const [permissionsDialogAgent, setPermissionsDialogAgent] = useState<any>(null);
  const [currentPermissions, setCurrentPermissions] = useState<Record<string, boolean>>({ ...DEFAULT_PERMISSIONS });

  const savePermissionsMutation = useMutation({
    mutationFn: async ({ agentId, permissions }: { agentId: number; permissions: Record<string, boolean> }) => {
      const res = await apiRequest("PATCH", `/api/agents/${agentId}/permissions`, permissions);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Permissions sauvegardées", description: "Les accès de l'agent ont été mis à jour." });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setPermissionsDialogAgent(null);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de sauvegarder les permissions.", variant: "destructive" });
    },
  });

  const openPermissionsDialog = async (agent: any) => {
    setPermissionsDialogAgent(agent);
    try {
      const res = await fetch(`/api/agents/${agent.id}/permissions`, { credentials: "include" });
      if (res.ok) {
        const perms = await res.json();
        setCurrentPermissions({ ...DEFAULT_PERMISSIONS, ...perms });
      } else {
        setCurrentPermissions({ ...DEFAULT_PERMISSIONS });
      }
    } catch {
      setCurrentPermissions({ ...DEFAULT_PERMISSIONS });
    }
  };

  const updateAgentMutation = useMutation({
    mutationFn: async ({ agentId, payload }: { agentId: number; payload: any }) => {
      const res = await apiRequest("PUT", `/api/users/${agentId}`, payload);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erreur lors de la mise à jour");
      }
      return res.json();
    },
    onSuccess: (_, { payload }) => {
      toast({ title: "Modifications enregistrées", description: `${payload.username || editingAgent?.username} a été mis à jour avec succès.` });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/store-settings"] });
      setEditOpen(false);
      setEditingAgent(null);
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message?.replace(/^\d+:\s*/, '') || "Erreur lors de la mise à jour", variant: "destructive" });
    },
  });

  // /api/agents/store-settings returns BOTH the legacy default row (magasinId
  // IS NULL) and any per-magasin rows. We only want the default row here —
  // it carries account-wide fields (roleInStore, allowedProductIds,
  // allowedRegions, leadPercentage). Collapsing all rows into one map would
  // let a per-magasin row randomly shadow the default and wipe selections
  // from the edit modal. Per-magasin percentages are loaded separately via
  // useAgentMagasinPercentages.
  const agentSettingsMap = new Map(
    (agentSettings as any[])
      .filter((s: any) => s.magasinId == null)
      .map((s: any) => [s.agentId, s])
  );

  const openEditDialog = (agent: any) => {
    const setting = agentSettingsMap.get(agent.id);
    let parsedProductIds: number[] = [];
    let parsedRegions: string[] = [];
    try { parsedProductIds = JSON.parse(setting?.allowedProductIds || '[]'); } catch {}
    try { parsedRegions = JSON.parse(setting?.allowedRegions || '[]'); } catch {}
    setEditingAgent(agent);
    setEditForm({
      username: agent.username || "",
      phone: agent.phone || "",
      email: agent.email || "",
      password: "",
      paymentType: agent.paymentType || "commission",
      paymentAmount: agent.paymentAmount ? String(agent.paymentAmount / 100) : "",
      distributionMethod: (agent.distributionMethod || "auto") as DistMethod,
      roleInStore: setting?.roleInStore || "confirmation",
      isActive: agent.isActive === 1 || agent.isActive === true,
      leadPercentage: String(setting?.leadPercentage || 50),
      allowedProductIds: parsedProductIds,
      allowedRegions: parsedRegions,
      commissionRate: setting?.commissionRate != null ? String(setting.commissionRate) : "",
      memberType: agent.role === 'media_buyer' ? 'media_buyer' : 'agent',
      buyerCode: agent.buyerCode || "",
      // Reset the per-magasin map; PerMagasinPercentageGrid seeds it from the
      // server response on first load (one-shot useEffect).
      percentagesByMagasin: {},
    });
    setEditOpen(true);
  };

  const handleUpdateAgent = async () => {
    if (!editingAgent) return;
    if (!editForm.username || !editForm.email) {
      toast({ title: "Erreur", description: "Nom et email requis", variant: "destructive" });
      return;
    }
    const payload: any = {
      username: editForm.username,
      email: editForm.email,
      phone: editForm.phone || null,
      isActive: editForm.isActive ? 1 : 0,
    };
    if (editingAgent.role === 'media_buyer') {
      payload.buyerCode = editForm.buyerCode ? editForm.buyerCode.trim().toUpperCase() : null;
    } else if (editingAgent.role === 'agent') {
      payload.paymentType = editForm.paymentType;
      payload.paymentAmount = editForm.paymentAmount ? Math.round(parseFloat(editForm.paymentAmount) * 100) : 0;
      // distributionMethod is configured per-MAGASIN now (not per-agent).
      // We still send the per-agent rule values so they can be used by whichever
      // magasin chooses that strategy.
      payload.roleInStore = editForm.roleInStore;
      payload.commissionRate = editForm.commissionRate ? parseInt(editForm.commissionRate) : 0;
      // leadPercentage is now per-magasin and saved via a separate endpoint
      // below — no longer sent in the user PATCH payload.
      payload.allowedProductIds = editForm.allowedProductIds;
      payload.allowedRegions = editForm.allowedRegions;
    }

    // Save per-magasin percentages first (only when in % mode and there's data
    // to write), then update the rest of the user record. We don't block the
    // user save on the percentages save — both errors will surface via toast.
    const isAgent = editingAgent.role === 'agent';
    const hasPctData =
      isAgent &&
      editForm.distributionMethod === 'pourcentage' &&
      Object.keys(editForm.percentagesByMagasin || {}).length > 0;

    if (hasPctData) {
      try {
        await upsertAgentPercentages.mutateAsync({
          agentId: editingAgent.id,
          percentages: editForm.percentagesByMagasin,
        });
      } catch (err: any) {
        toast({
          title: "Erreur pourcentages",
          description: err?.message?.replace(/^\d+:\s*/, '') || "Impossible d'enregistrer les pourcentages par magasin",
          variant: "destructive",
        });
        return;
      }
    }

    updateAgentMutation.mutate({ agentId: editingAgent.id, payload });
  };

  const handleCreateAgent = async () => {
    if (!formData.username || !formData.email || !formData.password) {
      toast({ title: "Erreur", description: "Nom, email et mot de passe requis", variant: "destructive" });
      return;
    }
    if (formData.memberType === 'media_buyer' && !formData.buyerCode.trim()) {
      toast({ title: "Erreur", description: "Le code Media Buyer est requis (ex: RED1, FB-ADS)", variant: "destructive" });
      return;
    }
    try {
      const payload: any = {
        username: formData.username,
        email: formData.email,
        phone: formData.phone || undefined,
        password: formData.password,
        isActive: formData.isActive ? 1 : 0,
        role: formData.memberType,
      };
      if (formData.memberType === 'media_buyer') {
        payload.buyerCode = formData.buyerCode.trim().toUpperCase();
      } else {
        payload.paymentType = formData.paymentType;
        payload.paymentAmount = formData.paymentAmount ? Math.round(parseFloat(formData.paymentAmount) * 100) : 0;
        // distributionMethod is configured per-MAGASIN now. Always send all
        // per-agent rule values so any magasin can pick its own strategy.
        payload.roleInStore = formData.roleInStore;
        payload.commissionRate = formData.commissionRate ? parseInt(formData.commissionRate) : 0;
        payload.leadPercentage = parseInt(formData.leadPercentage) || 50;
        payload.allowedProductIds = formData.allowedProductIds;
        payload.allowedRegions = formData.allowedRegions;
      }
      await createAgent.mutateAsync(payload);
      toast({ title: "Membre ajouté", description: `${formData.username} a été ajouté avec succès` });
      setOpen(false);
      setFormData({ ...defaultForm });
      setProductSearch("");
      setRegionSearch("");
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message?.replace(/^\d+:\s*/, '') || "Erreur lors de la création", variant: "destructive" });
    }
  };

  const handleDeleteAgent = async (agentId: number, agentName: string) => {
    if (!confirm(`Supprimer ${agentName} ?`)) return;
    try {
      await deleteAgent.mutateAsync(agentId);
      toast({ title: "Supprimé", description: `${agentName} a été supprimé` });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message?.replace(/^\d+:\s*/, '') || "Erreur", variant: "destructive" });
    }
  };

  const openProductDialog = async (agent: any) => {
    setProductDialogAgent(agent);
    try {
      const res = await fetch(`/api/agents/${agent.id}/products`, { credentials: "include" });
      if (res.ok) {
        const existing = await res.json();
        setSelectedProductIds(existing.map((ap: any) => ap.productId));
      } else {
        setSelectedProductIds([]);
      }
    } catch {
      setSelectedProductIds([]);
    }
  };

  const handleSaveProducts = async () => {
    if (!productDialogAgent) return;
    try {
      await setAgentProducts.mutateAsync({ agentId: productDialogAgent.id, productIds: selectedProductIds });
      toast({ title: "Produits assignés", description: `Produits mis à jour pour ${productDialogAgent.username}` });
      setProductDialogAgent(null);
    } catch {
      toast({ title: "Erreur", description: "Impossible d'assigner les produits", variant: "destructive" });
    }
  };

  const toggleProductId = (pid: number) => {
    setSelectedProductIds(prev => prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]);
  };

  const getAgentStats = (agentId: number) => {
    const stats = performance?.find((p: any) => p.agentId === agentId);
    return stats || { total: 0, confirmed: 0, delivered: 0, cancelled: 0 };
  };

  const getAgentRole = (agentId: number) => {
    const setting = agentSettingsMap.get(agentId);
    return setting?.roleInStore || 'confirmation';
  };

  const totalAgents = agents?.filter((a: any) => a.role === 'agent')?.length || 0;
  const allStats = performance || [];
  const totalConfirmed = allStats.reduce((s: number, p: any) => s + (p.confirmed || 0), 0);
  const totalDelivered = allStats.reduce((s: number, p: any) => s + (p.delivered || 0), 0);
  const totalAssigned = allStats.reduce((s: number, p: any) => s + (p.total || 0), 0);

  const toggleFormProduct = (id: number) => {
    setFormData(f => ({
      ...f,
      allowedProductIds: f.allowedProductIds.includes(id)
        ? f.allowedProductIds.filter(p => p !== id)
        : [...f.allowedProductIds, id],
    }));
  };

  const toggleFormRegion = (value: string) => {
    setFormData(f => ({
      ...f,
      allowedRegions: f.allowedRegions.includes(value)
        ? f.allowedRegions.filter(r => r !== value)
        : [...f.allowedRegions, value],
    }));
  };

  // Last distribution reset (max distributionEpoch across owned magasins).
  const { data: ownedMagasins = [] } = useQuery<any[]>({ queryKey: ['/api/magasins'] });
  const lastResetAt = ownedMagasins
    .map(m => m.distributionEpoch ? new Date(m.distributionEpoch).getTime() : 0)
    .reduce((a, b) => Math.max(a, b), 0);
  const lastResetLabel = lastResetAt > 0
    ? new Date(lastResetAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const resetDistributionMutation = useMutation({
    mutationFn: async () => apiRequest('POST', '/api/magasins/reset-distribution-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/magasins'] });
      toast({ title: "Distribution réinitialisée", description: "Les compteurs repartent de zéro pour tous vos magasins." });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err?.message || "Échec de la réinitialisation", variant: "destructive" });
    },
  });

  const handleResetDistribution = () => {
    if (!confirm("Réinitialiser la distribution sur tous vos magasins ?\n\nLes commandes futures seront équilibrées selon les pourcentages actuels. Les commandes passées ne seront plus comptées dans le calcul.")) return;
    resetDistributionMutation.mutate();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold uppercase" data-testid="text-team-title">Liste des membres</h1>
          <p className="text-muted-foreground mt-1">Gestion de l'équipe / Membres</p>
          {lastResetLabel && (
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-distribution-epoch">
              Dernière réinitialisation enregistrée : <span className="font-medium">{lastResetLabel}</span> — les commandes antérieures à la date de réinitialisation de chaque magasin ne sont pas comptées.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleResetDistribution}
            disabled={resetDistributionMutation.isPending}
            className="rounded-md px-3 py-2 flex items-center gap-2"
            data-testid="button-reset-distribution"
          >
            {resetDistributionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Réinitialiser la distribution
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-member" className="bg-primary hover:bg-primary/90 text-white rounded-md px-4 py-2 flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Ajouter un membre
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-white dark:bg-card">
            <div className="flex justify-between items-center px-7 pt-6 pb-4 border-b">
              <DialogTitle className="text-xl font-bold">Ajouter un nouveau membre</DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="rounded-full">
                <X className="w-5 h-5 text-muted-foreground" />
              </Button>
            </div>

            <div className="px-7 py-5 space-y-6 max-h-[72vh] overflow-y-auto">
              {/* Member type selector */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground">Type de membre</Label>
                <div className="grid grid-cols-2 gap-2 border rounded-lg p-1 bg-muted/20">
                  <button type="button" onClick={() => setFormData(d => ({ ...d, memberType: 'agent' }))}
                    className={cn("h-9 rounded-md text-sm font-medium transition-all", formData.memberType === 'agent' ? "bg-white dark:bg-card shadow-sm text-primary border border-border" : "text-muted-foreground hover:text-foreground")}>
                    Agent
                  </button>
                  <button type="button" onClick={() => setFormData(d => ({ ...d, memberType: 'media_buyer' }))}
                    className={cn("h-9 rounded-md text-sm font-medium transition-all", formData.memberType === 'media_buyer' ? "bg-white dark:bg-card shadow-sm text-violet-600 border border-border" : "text-muted-foreground hover:text-foreground")}>
                    Media Buyer
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-foreground">Nom complet</Label>
                  <Input data-testid="input-agent-name" value={formData.username} onChange={e => setFormData(d => ({ ...d, username: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-foreground">Téléphone</Label>
                  <Input data-testid="input-agent-phone" placeholder="ex: 01 23 45 67 89" value={formData.phone} onChange={e => setFormData(d => ({ ...d, phone: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-foreground">Adresse e-mail</Label>
                  <Input data-testid="input-agent-email" type="email" placeholder="ex: agent@tajergrow.com" value={formData.email} onChange={e => setFormData(d => ({ ...d, email: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-foreground">Mot de passe</Label>
                  <Input data-testid="input-agent-password" type="password" value={formData.password} onChange={e => setFormData(d => ({ ...d, password: e.target.value }))} className="h-11" />
                </div>
              </div>

              {formData.memberType === 'media_buyer' ? (
                <div className="bg-violet-50 dark:bg-violet-900/10 rounded-xl border border-violet-200 dark:border-violet-800 p-5 space-y-4">
                  <p className="text-xs font-bold text-violet-600 uppercase tracking-widest">Configuration Media Buyer</p>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-foreground">Code d'attribution unique</Label>
                    <div className="relative">
                      <Input
                        data-testid="input-buyer-code"
                        placeholder="Ex: RED1, FB-ADS, MB-SOUF"
                        value={formData.buyerCode}
                        onChange={e => setFormData(d => ({ ...d, buyerCode: e.target.value.toUpperCase() }))}
                        className="h-11 font-mono uppercase"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Ce code doit correspondre exactement au UTM source entrant (ex: utm_source=RED1). Les commandes avec ce UTM source seront automatiquement attribuées à ce Media Buyer.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.isActive} onCheckedChange={v => setFormData(d => ({ ...d, isActive: v }))} />
                    <span className="text-sm text-muted-foreground">Compte actif</span>
                  </div>
                </div>
              ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-3">Assigner à des magasins et rôles.</p>
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-foreground">Choisir les magasins</Label>
                    <div className="flex items-center h-11 px-3 border rounded-lg bg-muted/20 text-sm text-muted-foreground">
                      <span>Boutique actuelle (assigné automatiquement)</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-foreground">Choisir les rôles</Label>
                    <Select value={formData.roleInStore} onValueChange={v => setFormData(d => ({ ...d, roleInStore: v }))}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Sélectionner les Rôles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="confirmation">Confirmation</SelectItem>
                        <SelectItem value="suivi">Suivi</SelectItem>
                        <SelectItem value="both">Les deux</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-foreground">Type de Paiement</Label>
                    <Select value={formData.paymentType} onValueChange={v => setFormData(d => ({ ...d, paymentType: v }))}>
                      <SelectTrigger className="h-11" data-testid="select-payment-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="commission">Comission</SelectItem>
                        <SelectItem value="fixe">Fixe</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-foreground">Montant</Label>
                    <Input data-testid="input-agent-amount" placeholder="Ex: 50.00" value={formData.paymentAmount} onChange={e => setFormData(d => ({ ...d, paymentAmount: e.target.value }))} className="h-11" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-sm font-semibold" style={{ color: '#C5A059' }}>Commission par Livré (DH)</Label>
                    <div className="relative">
                      <Input
                        data-testid="input-agent-commission-rate"
                        type="number"
                        min="0"
                        placeholder="Ex: 5 (DH par commande livrée)"
                        value={formData.commissionRate}
                        onChange={e => setFormData(d => ({ ...d, commissionRate: e.target.value }))}
                        className="h-11 pr-10"
                        style={{ borderColor: formData.commissionRate ? '#C5A059' : undefined }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: '#C5A059' }}>DH</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Montant gagné par l'agent pour chaque commande livrée (statut Livré)</p>
                  </div>
                </div>
              </div>
              )}

              {formData.memberType === 'agent' && (
              <div className="bg-muted/30 rounded-xl border p-5 space-y-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Méthode de répartition</p>

                <div className="grid grid-cols-4 border rounded-lg bg-background overflow-hidden">
                  {DIST_METHOD_TABS.map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, distributionMethod: method }))}
                      className={cn("py-2.5 text-sm font-medium border-l first:border-l-0 transition-colors", formData.distributionMethod === method ? "bg-primary text-primary-foreground font-bold" : "text-primary hover:bg-muted/50")}
                    >
                      {method === "auto" ? "Auto" : method === "pourcentage" ? "Pourcentage" : method === "produit" ? "Produit" : "Région"}
                    </button>
                  ))}
                </div>

                {formData.distributionMethod === "auto" && (
                  <p className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/30">
                    Distribution équitable. Chaque agent reçoit une commande à
                    tour de rôle, quel que soit le nombre d'agents (3 → A, B, C, A, B, C…).
                  </p>
                )}

                {formData.distributionMethod === "pourcentage" && (() => {
                  const otherAgentsSum = (agents || [])
                    .filter((a: any) => a.role === 'agent')
                    .reduce((sum: number, a: any) => {
                      const setting = (agentSettings as any[]).find((s: any) => s.agentId === a.id);
                      return sum + (setting?.leadPercentage || 0);
                    }, 0);
                  const newValue = parseInt(formData.leadPercentage) || 0;
                  const total = otherAgentsSum + newValue;
                  // Ratios don't have to sum to 100 — engine normalizes. Show
                  // the agent's effective share so the user understands the
                  // outcome of their numbers.
                  const sharePct = total > 0 ? Math.round((newValue / total) * 100) : 0;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center border rounded-lg overflow-hidden bg-background">
                          <span className="px-3 py-2.5 text-sm font-bold bg-muted text-muted-foreground border-r">%</span>
                          <Input
                            type="number"
                            min={0}
                            value={formData.leadPercentage}
                            onChange={e => setFormData(d => ({ ...d, leadPercentage: e.target.value }))}
                            className="border-none shadow-none h-10 w-32 focus-visible:ring-0 text-sm"
                            placeholder="50"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">Poids relatif de cet agent (les pourcentages sont des <strong>ratios</strong>).</p>
                      </div>
                      <p
                        className={cn(
                          "text-xs font-semibold tabular-nums",
                          total > 0 ? "text-muted-foreground" : "text-orange-600"
                        )}
                        data-testid="text-percentage-sum-create"
                      >
                        {total > 0
                          ? `Part de cet agent: ${sharePct}% (somme actuelle: ${total})`
                          : "Aucun agent configuré"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        S'applique aux magasins en mode « Pourcentage ». La méthode de distribution se configure dans Magasins.
                      </p>
                    </div>
                  );
                })()}

                {formData.distributionMethod === "produit" && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Cet agent reçoit uniquement les commandes contenant les produits sélectionnés.</p>
                    <MultiSelectDropdown
                      label="Sélectionner les Produits"
                      search={productSearch}
                      setSearch={setProductSearch}
                      items={products || []}
                      selected={formData.allowedProductIds}
                      onToggle={(id) => toggleFormProduct(id as number)}
                      renderItem={(p: any) => ({ id: p.id, label: p.name, sublabel: p.sku })}
                      noItemsText="Aucun produit disponible"
                    />
                  </div>
                )}

                {formData.distributionMethod === "region" && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Cet agent reçoit uniquement les commandes des régions sélectionnées.</p>
                    <MultiSelectDropdown
                      label="Sélectionner les régions"
                      search={regionSearch}
                      setSearch={setRegionSearch}
                      items={MOROCCAN_REGIONS}
                      selected={formData.allowedRegions}
                      onToggle={(id) => toggleFormRegion(id as string)}
                      renderItem={(r: any) => ({ id: r.value, label: r.label })}
                      noItemsText="Aucune région disponible"
                    />
                  </div>
                )}
              </div>
              )}

              {formData.memberType === 'agent' && (
              <div className="flex items-center gap-3 pb-1">
                <Switch id="active" checked={formData.isActive} onCheckedChange={v => setFormData(d => ({ ...d, isActive: v }))} />
                <label htmlFor="active" className="text-sm font-semibold cursor-pointer">Actif</label>
              </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-7 py-5 bg-muted/10 border-t">
              <Button variant="outline" onClick={() => setOpen(false)} className="px-7">Fermer</Button>
              <Button data-testid="button-save-agent" onClick={handleCreateAgent} disabled={createAgent.isPending} className="px-7">
                {createAgent.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enregistrement...</> : "Enregistrer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* ── "Actions du jour" filters ──────────────────────────────────────
          Owner picks a date and (optionally) narrows to one magasin. The
          stats cards + the agent table's "ACTIONS DU JOUR" column both
          react to this filter. */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="perf-date" className="text-[11px] font-bold text-muted-foreground uppercase">Jour</Label>
          <Input
            id="perf-date"
            type="date"
            value={perfDate}
            max={todayStr}
            onChange={(e) => setPerfDate(e.target.value || todayStr)}
            className="h-9 w-[160px]"
            data-testid="input-perf-date"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="perf-magasin" className="text-[11px] font-bold text-muted-foreground uppercase">Magasin</Label>
          <Select value={perfMagasinId} onValueChange={setPerfMagasinId}>
            <SelectTrigger id="perf-magasin" className="h-9 w-[200px]" data-testid="select-perf-magasin">
              <SelectValue placeholder="Tous les magasins" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="option-perf-magasin-all">Tous les magasins</SelectItem>
              {magasins.map((m: any) => (
                <SelectItem key={m.id} value={String(m.id)} data-testid={`option-perf-magasin-${m.id}`}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(perfDate !== todayStr || perfMagasinId !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs gap-1"
            onClick={() => { setPerfDate(todayStr); setPerfMagasinId("all"); }}
            data-testid="button-perf-reset"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-4 border-border/50 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase">Total Agents</p>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-members">{totalAgents}</p>
          </div>
          <div className="w-10 h-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center"><ShoppingBag className="w-5 h-5" /></div>
        </Card>
        <Card className="p-4 border-border/50 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase">Confirmées</p>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-confirmed">{totalConfirmed}</p>
          </div>
          <div className="w-10 h-10 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg flex items-center justify-center"><CheckCircle className="w-5 h-5" /></div>
        </Card>
        <Card className="p-4 border-border/50 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase">Livrées</p>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-delivered">{totalDelivered}</p>
          </div>
          <div className="w-10 h-10 bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg flex items-center justify-center"><Truck className="w-5 h-5" /></div>
        </Card>
        <Card className="p-4 border-border/50 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase">Total Assignées</p>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-assigned">{totalAssigned}</p>
          </div>
          <div className="w-10 h-10 bg-blue-100 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg flex items-center justify-center"><Activity className="w-5 h-5" /></div>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6">
          {[1, 2].map(i => <div key={i} className="h-40 bg-muted/50 rounded-2xl animate-pulse"></div>)}
        </div>
      ) : (
        <Table className="bg-card rounded-2xl border overflow-hidden">
          <TableHeader className="bg-muted/10">
            <TableRow>
              <TableHead>MEMBRE</TableHead>
              <TableHead>RÔLE</TableHead>
              <TableHead>PAIEMENT</TableHead>
              <TableHead>RÉPARTITION</TableHead>
              <TableHead>ACTIONS DU JOUR</TableHead>
              <TableHead>STATUT</TableHead>
              <TableHead className="text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!agents || agents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  Aucun membre. Cliquez "Ajouter un membre" pour commencer.
                </TableCell>
              </TableRow>
            ) : visibleAgents.map((agent: any) => {
              const stats = getAgentStats(agent.id);
              const confirmRate = stats.total > 0 ? Math.round((stats.confirmed / stats.total) * 100) : 0;
              const deliveryRate = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0;
              const roleInStore = getAgentRole(agent.id);
              const setting = agentSettingsMap.get(agent.id);

              return (
                <TableRow key={agent.id} className="hover:bg-muted/5" data-testid={`row-agent-${agent.id}`}>
                  <TableCell className="py-5">
                    <div className="flex items-start gap-3">
                      <Avatar className="w-10 h-10 rounded-full shrink-0">
                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${agent.username}`} />
                        <AvatarFallback>{agent.username[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold">{agent.username}</p>
                        <p className="text-xs text-muted-foreground">{agent.email}</p>
                        {agent.phone && <p className="text-xs text-muted-foreground">{agent.phone}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant="outline" className={cn("text-[10px]",
                        agent.role === 'owner' ? "bg-purple-50 text-purple-700 border-purple-200" :
                        agent.role === 'media_buyer' ? "bg-violet-50 text-violet-700 border-violet-200" :
                        "bg-blue-50 text-blue-600 border-blue-200"
                      )}>
                        {agent.role === 'owner' ? 'Admin' : agent.role === 'media_buyer' ? 'Media Buyer' : 'Agent'}
                      </Badge>
                      {agent.role === 'agent' && (
                        <div>
                          <Badge variant="outline" className={cn("text-[10px]",
                            roleInStore === 'suivi' ? "bg-sky-50 text-sky-700 border-sky-200" :
                            roleInStore === 'both' ? "bg-purple-50 text-purple-700 border-purple-200" :
                            "bg-green-50 text-green-700 border-green-200"
                          )}>
                            {ROLE_LABELS[roleInStore] || roleInStore}
                          </Badge>
                        </div>
                      )}
                      {agent.role === 'media_buyer' && agent.buyerCode && (
                        <div>
                          <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-600 border-violet-200 font-mono">
                            #{agent.buyerCode}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary text-[10px] w-fit capitalize">{agent.paymentType || 'commission'}</Badge>
                      {agent.paymentAmount > 0 && (
                        <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-none text-[10px] w-fit">{(agent.paymentAmount / 100).toFixed(2)} DH</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {agent.role === 'agent' ? (
                      <div className="text-xs space-y-1">
                        {/* Per-agent rule values configured in this magasin.
                            The active method is chosen on the magasin row, so we
                            just show whatever rule values exist for this agent. */}
                        {setting && typeof setting.leadPercentage === 'number' && setting.leadPercentage > 0 && (
                          <div className="flex items-center gap-1 text-muted-foreground" data-testid={`pct-agent-${agent.id}`}>
                            <Percent className="w-3 h-3" />
                            <span>{setting.leadPercentage}%</span>
                          </div>
                        )}
                        {setting && (() => {
                          try {
                            const regions: string[] = JSON.parse(setting.allowedRegions || '[]');
                            if (regions.length === 0) return null;
                            return (
                              <div className="flex items-start gap-1 flex-wrap">
                                <MapPin className="w-3 h-3 mt-0.5 text-muted-foreground" />
                                <div className="flex flex-wrap gap-1" data-testid={`regions-agent-${agent.id}`}>
                                  {regions.map((r) => {
                                    const meta = MOROCCAN_REGIONS.find(m => m.value === r);
                                    const label = meta ? meta.label.replace(/^Région\s+/i, '') : r;
                                    return (
                                      <Badge
                                        key={r}
                                        variant="outline"
                                        className="text-[10px] h-4 bg-purple-50 dark:bg-purple-900/20 text-purple-700 border-purple-200"
                                        data-testid={`badge-region-${agent.id}-${r}`}
                                      >
                                        {label}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          } catch { return null; }
                        })()}
                        {(!setting || (
                          (!setting.leadPercentage || setting.leadPercentage === 0) &&
                          (!setting.allowedRegions || setting.allowedRegions === '[]') &&
                          (!setting.allowedProductIds || setting.allowedProductIds === '[]')
                        )) && (
                          <span className="text-[10px] text-muted-foreground italic">Aucune règle</span>
                        )}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    {agent.role === 'agent' && stats.total > 0 ? (
                      <div className="space-y-1 text-xs">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                          <span className="text-muted-foreground">Traitées:</span>
                          <span className="font-semibold" data-testid={`text-actions-total-${agent.id}`}>{stats.total}</span>
                          <span className="text-muted-foreground">Confirmées:</span>
                          <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 h-4 w-fit" data-testid={`text-confirm-rate-${agent.id}`}>{confirmRate}%</Badge>
                          <span className="text-muted-foreground">Livrées:</span>
                          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 h-4 w-fit" data-testid={`text-delivery-rate-${agent.id}`}>{deliveryRate}%</Badge>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{agent.role === 'owner' ? '-' : 'Aucune action'}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2 h-2 rounded-full", agent.isActive ? "bg-green-500" : "bg-gray-400")}></span>
                      <span className="text-xs font-medium">{agent.isActive ? "Actif" : "Inactif"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {agent.role === 'agent' && (
                        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" data-testid={`button-assign-products-${agent.id}`} onClick={() => openProductDialog(agent)}>
                          <Package className="w-3.5 h-3.5" /> Produits
                        </Button>
                      )}
                      {agent.role === 'agent' && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="w-8 h-8 text-[#C5A059] border-[#C5A059]/30 hover:bg-[#C5A059]/10 hover:border-[#C5A059]"
                          data-testid={`button-permissions-${agent.id}`}
                          onClick={() => openPermissionsDialog(agent)}
                          title="Gérer les permissions"
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </Button>
                      )}
                      {agent.role !== 'owner' && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="w-8 h-8 text-blue-500 border-blue-200 hover:bg-blue-50 hover:border-blue-400"
                          data-testid={`button-edit-agent-${agent.id}`}
                          onClick={() => openEditDialog(agent)}
                          title="Modifier le membre"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      {agent.role !== 'owner' && (
                        <Button variant="ghost" size="icon" className="w-8 h-8 text-red-500 hover:text-red-700 hover:bg-red-50" data-testid={`button-delete-agent-${agent.id}`} onClick={() => handleDeleteAgent(agent.id, agent.username)} disabled={deleteAgent.isPending}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* ── Media Buyers Summary Table ── */}
      <MediaBuyersSummaryTable />

      {/* ── Permissions Modal ── */}
      <Dialog open={!!permissionsDialogAgent} onOpenChange={(open) => { if (!open) setPermissionsDialogAgent(null); }}>
        {permissionsDialogAgent && (
          <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
            <div className="bg-gradient-to-r from-[#C5A059]/10 to-[#C5A059]/5 border-b border-[#C5A059]/20 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#C5A059]/15 border border-[#C5A059]/30">
                  <ShieldCheck className="w-5 h-5 text-[#C5A059]" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    Permissions du Dashboard
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{permissionsDialogAgent.username}</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 space-y-1">
              {Object.entries(PERMISSION_LABELS).map(([key, { label, description }]) => (
                <div
                  key={key}
                  className="flex items-start justify-between gap-4 py-3 border-b border-border/30 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{description}</p>
                  </div>
                  <Switch
                    checked={!!currentPermissions[key]}
                    onCheckedChange={(checked) => setCurrentPermissions(prev => ({ ...prev, [key]: checked }))}
                    data-testid={`switch-perm-${key}`}
                    style={{
                      backgroundColor: currentPermissions[key] ? '#C5A059' : undefined,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-border/30 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setPermissionsDialogAgent(null)}>
                Annuler
              </Button>
              <Button
                data-testid="button-save-permissions"
                onClick={() => savePermissionsMutation.mutate({ agentId: permissionsDialogAgent.id, permissions: currentPermissions })}
                disabled={savePermissionsMutation.isPending}
                className="gap-2 bg-[#C5A059] hover:bg-[#b8904a] text-white border-0"
              >
                {savePermissionsMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />
                }
                Sauvegarder les permissions
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!productDialogAgent} onOpenChange={(open) => { if (!open) setProductDialogAgent(null); }}>
        {productDialogAgent && (
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogTitle className="text-lg font-bold">Assigner des produits à {productDialogAgent.username}</DialogTitle>
            <p className="text-sm text-muted-foreground mb-4">
              Sélectionnez les produits que cet agent peut gérer.
            </p>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {products && products.length > 0 ? products.map((product: any) => (
                <label key={product.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 cursor-pointer transition-colors" data-testid={`checkbox-product-${product.id}`}>
                  <Checkbox checked={selectedProductIds.includes(product.id)} onCheckedChange={() => toggleProductId(product.id)} />
                  <div className="flex-1">
                    <span className="font-medium text-sm">{product.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">SKU: {product.sku}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{product.stock} en stock</Badge>
                </label>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun produit disponible</p>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setProductDialogAgent(null)}>Annuler</Button>
              <Button data-testid="button-save-agent-products" onClick={handleSaveProducts} disabled={setAgentProducts.isPending} className="gap-2">
                {setAgentProducts.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Sauvegarder ({selectedProductIds.length})
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Edit Member Modal ── */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) { setEditOpen(false); setEditingAgent(null); } }}>
        {editingAgent && (
          <DialogContent className="sm:max-w-2xl rounded-2xl p-0 overflow-hidden border-none shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 px-7 pt-6 pb-4 border-b border-border/40 sticky top-0 bg-background z-10">
              <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200">
                <Pencil className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">Modifier le membre</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{editingAgent.username} — {editingAgent.email}</p>
              </div>
            </div>

            <div className="px-7 py-5 space-y-6">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-foreground">Nom complet</Label>
                  <Input data-testid="input-edit-name" value={editForm.username} onChange={e => setEditForm(d => ({ ...d, username: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-foreground">Téléphone</Label>
                  <Input data-testid="input-edit-phone" placeholder="ex: 0661234567" value={editForm.phone} onChange={e => setEditForm(d => ({ ...d, phone: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-foreground">Email</Label>
                  <Input data-testid="input-edit-email" type="email" value={editForm.email} onChange={e => setEditForm(d => ({ ...d, email: e.target.value }))} className="h-11" />
                </div>
              </div>

              {editingAgent.role === 'media_buyer' && (
                <div className="bg-violet-50 dark:bg-violet-900/10 rounded-xl border border-violet-200 dark:border-violet-800 p-5 space-y-4">
                  <p className="text-xs font-bold text-violet-600 uppercase tracking-widest">Code Media Buyer</p>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-foreground">Code d'attribution unique</Label>
                    <Input
                      data-testid="input-edit-buyer-code"
                      placeholder="Ex: RED1, FB-ADS"
                      value={editForm.buyerCode}
                      onChange={e => setEditForm(d => ({ ...d, buyerCode: e.target.value.toUpperCase() }))}
                      className="h-11 font-mono uppercase"
                    />
                    <p className="text-xs text-muted-foreground">Doit correspondre au utm_source entrant pour auto-attribution.</p>
                  </div>
                </div>
              )}

              {editingAgent.role === 'agent' && (
                <div>
                  <p className="text-sm text-muted-foreground mb-3">Configuration du rôle et de la commission.</p>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold text-foreground">Spécialité Agent</Label>
                      <Select value={editForm.roleInStore} onValueChange={v => setEditForm(d => ({ ...d, roleInStore: v }))}>
                        <SelectTrigger className="h-11" data-testid="select-edit-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="confirmation">Confirmation</SelectItem>
                          <SelectItem value="suivi">Suivi</SelectItem>
                          <SelectItem value="both">Les deux</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold text-foreground">Type de Paiement</Label>
                      <Select value={editForm.paymentType} onValueChange={v => setEditForm(d => ({ ...d, paymentType: v }))}>
                        <SelectTrigger className="h-11" data-testid="select-edit-payment-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="commission">Commission</SelectItem>
                          <SelectItem value="fixe">Fixe</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold text-foreground">Montant (DH)</Label>
                      <Input data-testid="input-edit-amount" placeholder="Ex: 50.00" value={editForm.paymentAmount} onChange={e => setEditForm(d => ({ ...d, paymentAmount: e.target.value }))} className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold" style={{ color: '#C5A059' }}>Commission par Livré (DH)</Label>
                      <div className="relative">
                        <Input
                          data-testid="input-edit-commission-rate"
                          type="number"
                          min="0"
                          placeholder="Ex: 5"
                          value={editForm.commissionRate}
                          onChange={e => setEditForm(d => ({ ...d, commissionRate: e.target.value }))}
                          className="h-11 pr-10"
                          style={{ borderColor: editForm.commissionRate ? '#C5A059' : undefined }}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: '#C5A059' }}>DH</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {editingAgent.role === 'agent' && (
                <div className="bg-muted/30 rounded-xl border p-5 space-y-4">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Méthode de répartition</p>
                  <div className="grid grid-cols-4 border rounded-lg bg-background overflow-hidden">
                    {DIST_METHOD_TABS.map(method => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setEditForm(d => ({ ...d, distributionMethod: method }))}
                        className={cn("py-2.5 text-sm font-medium border-l first:border-l-0 transition-colors", editForm.distributionMethod === method ? "bg-primary text-primary-foreground font-bold" : "text-primary hover:bg-muted/50")}
                      >
                        {method === "auto" ? "Auto" : method === "pourcentage" ? "%" : method === "produit" ? "Produit" : "Région"}
                      </button>
                    ))}
                  </div>
                  {editForm.distributionMethod === "auto" && (
                    <p className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/30">
                      Distribution équitable. Chaque agent reçoit une commande à
                      tour de rôle, quel que soit le nombre d'agents (3 → A, B, C, A, B, C…).
                    </p>
                  )}
                  {editForm.distributionMethod === "pourcentage" && (
                    <PerMagasinPercentageGrid
                      agentId={editingAgent.id}
                      magasins={magasins as any[]}
                      values={editForm.percentagesByMagasin}
                      onChange={(next) => setEditForm(d => ({ ...d, percentagesByMagasin: next }))}
                    />
                  )}
                  {editForm.distributionMethod === "produit" && (
                    <div className="space-y-3 mt-3">
                      <p className="text-xs text-muted-foreground">
                        Sélectionnez les produits pris en charge par cet agent.
                        Les commandes contenant ces produits seront automatiquement
                        attribuées à cet agent (en plus des règles de pourcentage
                        si elles s'appliquent).
                      </p>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto rounded-lg border p-2">
                        {((products as any[]) || []).map((p: any) => {
                          const checked = (editForm.allowedProductIds || []).includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                              data-testid={`product-row-${p.id}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setEditForm(d => ({
                                    ...d,
                                    allowedProductIds: e.target.checked
                                      ? [...(d.allowedProductIds || []), p.id]
                                      : (d.allowedProductIds || []).filter((id: number) => id !== p.id),
                                  }));
                                }}
                              />
                              <span className="text-sm flex-1 truncate">{p.name}</span>
                              <span className="text-xs text-muted-foreground">
                                Stock: {p.stock ?? '—'}
                              </span>
                            </label>
                          );
                        })}
                        {((products as any[]) || []).length === 0 && (
                          <p className="text-xs text-muted-foreground p-3 text-center">
                            Aucun produit en stock. Ajoutez des produits depuis la page Produits.
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          data-testid="button-product-select-all"
                          onClick={() => setEditForm(d => ({ ...d, allowedProductIds: ((products as any[]) || []).map((p: any) => p.id) }))}
                        >
                          Tout sélectionner
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          data-testid="button-product-clear"
                          onClick={() => setEditForm(d => ({ ...d, allowedProductIds: [] }))}
                        >
                          Tout désélectionner
                        </Button>
                      </div>
                    </div>
                  )}
                  {editForm.distributionMethod === "region" && (
                    <div className="space-y-3 mt-3">
                      <p className="text-xs text-muted-foreground">
                        Sélectionnez les régions du Maroc prises en charge par
                        cet agent. Les commandes des villes appartenant à ces
                        régions seront attribuées à cet agent. Les villes
                        correspondantes sont reconnues automatiquement.
                      </p>
                      <div className="space-y-1.5 max-h-72 overflow-y-auto rounded-lg border p-2">
                        {MOROCCAN_REGIONS.map((region) => {
                          const checked = (editForm.allowedRegions || []).includes(region.value);
                          const cities = REGION_PREVIEW[region.value] || [];
                          return (
                            <label
                              key={region.value}
                              className="flex items-start gap-2 px-2 py-2 rounded hover:bg-accent cursor-pointer"
                              data-testid={`region-row-${region.value}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                className="mt-1"
                                onChange={(e) => {
                                  setEditForm(d => ({
                                    ...d,
                                    allowedRegions: e.target.checked
                                      ? [...(d.allowedRegions || []), region.value]
                                      : (d.allowedRegions || []).filter((r: string) => r !== region.value),
                                  }));
                                }}
                              />
                              <div className="flex-1">
                                <span className="text-sm font-medium">{region.label}</span>
                                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                  {cities.slice(0, 5).join(', ')}{cities.length > 5 ? `, +${cities.length - 5}` : ''}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          data-testid="button-region-select-all"
                          onClick={() => setEditForm(d => ({ ...d, allowedRegions: MOROCCAN_REGIONS.map(r => r.value) }))}
                        >
                          Tout le Maroc
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          data-testid="button-region-clear"
                          onClick={() => setEditForm(d => ({ ...d, allowedRegions: [] }))}
                        >
                          Effacer
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Switch
                  id="edit-active"
                  checked={editForm.isActive}
                  onCheckedChange={v => setEditForm(d => ({ ...d, isActive: v }))}
                  data-testid="switch-edit-active"
                />
                <label htmlFor="edit-active" className="text-sm font-semibold cursor-pointer">Actif</label>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-7 py-5 bg-muted/10 border-t sticky bottom-0 bg-background">
              <Button variant="outline" onClick={() => { setEditOpen(false); setEditingAgent(null); }} className="px-7">Annuler</Button>
              <Button
                data-testid="button-save-edit-agent"
                onClick={handleUpdateAgent}
                disabled={updateAgentMutation.isPending}
                className="px-7 gap-2"
              >
                {updateAgentMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Enregistrement...</> : <><Save className="w-4 h-4" />Enregistrer</>}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
