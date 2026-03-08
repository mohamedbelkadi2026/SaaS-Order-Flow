import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAgents, useIntegrations, useStore, useMagasins, useCreateMagasin, useUpdateMagasin } from "@/hooks/use-store-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Store, User, CheckCircle2, Truck, Globe, Plus, Pencil, Save, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Magasins() {
  const { user } = useAuth();
  const { data: agents } = useAgents();
  const { data: integrations } = useIntegrations("store");
  const { data: storeData } = useStore();
  const { data: magasins } = useMagasins();
  const createMagasin = useCreateMagasin();
  const updateMagasin = useUpdateMagasin();
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [editStore, setEditStore] = useState<any>(null);
  const [newName, setNewName] = useState("");
  const [editName, setEditName] = useState("");

  const storeName = storeData?.name || "Ma Boutique";
  const ownerName = user?.username || "Propri\u00e9taire";
  const connectedStores = integrations?.filter((i: any) => i.isActive) || [];

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast({ title: "Erreur", description: "Nom du magasin requis", variant: "destructive" });
      return;
    }
    try {
      await createMagasin.mutateAsync({ name: newName.trim() });
      toast({ title: "Magasin cr\u00e9\u00e9", description: `${newName} a \u00e9t\u00e9 ajout\u00e9` });
      setNewName("");
      setAddOpen(false);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Impossible de cr\u00e9er le magasin", variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!editStore || !editName.trim()) return;
    try {
      await updateMagasin.mutateAsync({ id: editStore.id, name: editName.trim() });
      toast({ title: "Mis \u00e0 jour", description: "Nom du magasin modifi\u00e9" });
      setEditStore(null);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Erreur", variant: "destructive" });
    }
  };

  const openEdit = (store: any) => {
    setEditStore(store);
    setEditName(store.name);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-display font-bold" data-testid="text-magasins-title">Mes magasins</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-magasin" className="gap-2">
              <Plus className="w-4 h-4" /> Nouveau Magasin
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogTitle className="text-lg font-bold">Cr\u00e9er un nouveau magasin</DialogTitle>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-muted-foreground">Nom du magasin</label>
                <Input data-testid="input-magasin-name" placeholder="Ex: Ma Boutique Casablanca" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-11" />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
                <Button data-testid="button-save-magasin" onClick={handleCreate} disabled={createMagasin.isPending} className="gap-2">
                  {createMagasin.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Cr\u00e9er
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden" data-testid="card-store-main">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden border">
                  <Store className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-bold text-lg uppercase tracking-tight" data-testid="text-store-name">{storeName}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="w-3 h-3" /> {ownerName}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openEdit(storeData)} data-testid="button-edit-store">
                <Pencil className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>

            <div className="flex gap-2 mb-6 flex-wrap">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 px-3 py-1 flex items-center gap-1.5 rounded-lg font-medium">
                <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                </div>
                Actif
              </Badge>
              <Badge variant="outline" className="text-xs">Magasin principal</Badge>
            </div>

            <div className="bg-muted/30 rounded-xl p-4 mb-6">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">\u00c9QUIPE DE TRAITEMENT</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="font-semibold">Agents:</span>
                  <span className="text-muted-foreground" data-testid="text-agent-list">
                    {agents && agents.length > 0
                      ? agents.map((a: any) => a.username).join(", ")
                      : "Aucun agent"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Truck className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold">Total agents:</span>
                  <span className="text-muted-foreground">{agents?.length || 0}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex gap-2 flex-wrap">
                {connectedStores.length > 0 ? connectedStores.map((s: any) => (
                  <div key={s.id} className="w-6 h-6 rounded bg-muted flex items-center justify-center text-muted-foreground" title={s.provider}>
                    <Globe className="w-3.5 h-3.5" />
                  </div>
                )) : (
                  <span className="text-xs text-muted-foreground">Aucune int\u00e9gration connect\u00e9e</span>
                )}
              </div>
              <div className="flex items-center h-6 w-10 bg-green-500 rounded-full relative px-1">
                <div className="w-4 h-4 bg-white rounded-full ml-auto shadow-sm"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {magasins?.filter((m: any) => m.id !== storeData?.id).map((store: any) => (
          <Card key={store.id} className="rounded-2xl border-border/50 shadow-sm overflow-hidden" data-testid={`card-store-${store.id}`}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center border">
                    <Store className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg uppercase tracking-tight">{store.name}</h3>
                    <p className="text-xs text-muted-foreground">ID: {store.id}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openEdit(store)}>
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
              <Badge variant="outline" className="text-xs">Cr\u00e9\u00e9 le {store.createdAt ? new Date(store.createdAt).toLocaleDateString('fr-MA') : '-'}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editStore} onOpenChange={(open) => { if (!open) setEditStore(null); }}>
        {editStore && (
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogTitle className="text-lg font-bold">Modifier le magasin</DialogTitle>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-muted-foreground">Nom du magasin</label>
                <Input data-testid="input-edit-magasin-name" value={editName} onChange={(e) => setEditName(e.target.value)} className="h-11" />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setEditStore(null)}>Annuler</Button>
                <Button data-testid="button-update-magasin" onClick={handleUpdate} disabled={updateMagasin.isPending} className="gap-2">
                  {updateMagasin.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Sauvegarder
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
