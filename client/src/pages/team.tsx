import { useState } from "react";
import { useAgents, useCreateAgent, useAgentPerformance, useDeleteAgent, useProducts, useAgentProducts, useSetAgentProducts } from "@/hooks/use-store-data";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, ShoppingBag, CheckCircle, Truck, Activity, Trash2, Package, X, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Team() {
  const { data: agents, isLoading } = useAgents();
  const { data: performance } = useAgentPerformance();
  const { data: products } = useProducts();
  const createAgent = useCreateAgent();
  const deleteAgent = useDeleteAgent();
  const setAgentProducts = useSetAgentProducts();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [productDialogAgent, setProductDialogAgent] = useState<any>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);

  const [formData, setFormData] = useState({
    username: "",
    phone: "",
    email: "",
    password: "",
    paymentType: "commission",
    paymentAmount: "",
    distributionMethod: "auto",
    isActive: true,
  });

  const handleCreateAgent = async () => {
    if (!formData.username || !formData.email || !formData.password) {
      toast({ title: "Erreur", description: "Nom, email et mot de passe requis", variant: "destructive" });
      return;
    }
    try {
      await createAgent.mutateAsync({
        username: formData.username,
        email: formData.email,
        phone: formData.phone || undefined,
        password: formData.password,
        paymentType: formData.paymentType,
        paymentAmount: formData.paymentAmount ? Math.round(parseFloat(formData.paymentAmount) * 100) : 0,
        distributionMethod: formData.distributionMethod,
        isActive: formData.isActive ? 1 : 0,
      });
      toast({ title: "Membre ajout\u00e9", description: `${formData.username} a \u00e9t\u00e9 ajout\u00e9 avec succ\u00e8s` });
      setOpen(false);
      setFormData({ username: "", phone: "", email: "", password: "", paymentType: "commission", paymentAmount: "", distributionMethod: "auto", isActive: true });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message?.replace(/^\d+:\s*/, '') || "Erreur lors de la cr\u00e9ation", variant: "destructive" });
    }
  };

  const handleDeleteAgent = async (agentId: number, agentName: string) => {
    if (!confirm(`Supprimer ${agentName} ?`)) return;
    try {
      await deleteAgent.mutateAsync(agentId);
      toast({ title: "Supprim\u00e9", description: `${agentName} a \u00e9t\u00e9 supprim\u00e9` });
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
      toast({ title: "Produits assign\u00e9s", description: `Produits mis \u00e0 jour pour ${productDialogAgent.username}` });
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

  const totalAgents = agents?.filter((a: any) => a.role === 'agent')?.length || 0;
  const allStats = performance || [];
  const totalConfirmed = allStats.reduce((s: number, p: any) => s + (p.confirmed || 0), 0);
  const totalDelivered = allStats.reduce((s: number, p: any) => s + (p.delivered || 0), 0);
  const totalAssigned = allStats.reduce((s: number, p: any) => s + (p.total || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold uppercase" data-testid="text-team-title">Liste des membres</h1>
          <p className="text-muted-foreground mt-1">Gestion de l'\u00e9quipe / Membres</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-member" className="bg-primary hover:bg-primary/90 text-white rounded-md px-4 py-2 flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Ajouter un membre
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-3xl p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-white dark:bg-card">
            <div className="flex justify-between items-center p-6 border-b">
              <DialogTitle className="text-xl font-bold">Ajouter un nouveau membre</DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="rounded-full">
                <X className="w-5 h-5 text-muted-foreground" />
              </Button>
            </div>
            
            <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-muted-foreground">Nom complet</label>
                  <Input data-testid="input-agent-name" value={formData.username} onChange={(e) => setFormData(d => ({ ...d, username: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-muted-foreground">T\u00e9l\u00e9phone</label>
                  <Input data-testid="input-agent-phone" placeholder="ex: 06 12 34 56 78" value={formData.phone} onChange={(e) => setFormData(d => ({ ...d, phone: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-muted-foreground">Adresse e-mail</label>
                  <Input data-testid="input-agent-email" type="email" placeholder="ex: agent@tajergrow.com" value={formData.email} onChange={(e) => setFormData(d => ({ ...d, email: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-muted-foreground">Mot de passe</label>
                  <Input data-testid="input-agent-password" type="password" value={formData.password} onChange={(e) => setFormData(d => ({ ...d, password: e.target.value }))} className="h-11" />
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-muted-foreground">Type de Paiement</label>
                    <Select value={formData.paymentType} onValueChange={(v) => setFormData(d => ({ ...d, paymentType: v }))}>
                      <SelectTrigger className="h-11" data-testid="select-payment-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="commission">Commission</SelectItem>
                        <SelectItem value="fixe">Fixe</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-muted-foreground">Montant</label>
                    <Input data-testid="input-agent-amount" placeholder="Ex: 50.00" value={formData.paymentAmount} onChange={(e) => setFormData(d => ({ ...d, paymentAmount: e.target.value }))} className="h-11" />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-muted/30 rounded-xl border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">M\u00e9thode de r\u00e9partition</p>
                <div className="grid grid-cols-4 border rounded-lg bg-background overflow-hidden">
                  {["auto", "pourcentage", "produit", "region"].map((method) => (
                    <button key={method} type="button" onClick={() => setFormData(d => ({ ...d, distributionMethod: method }))} className={cn("py-2.5 text-sm font-medium border-l first:border-l-0", formData.distributionMethod === method ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:bg-muted/50")}>
                      {method.charAt(0).toUpperCase() + method.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {formData.distributionMethod === 'auto' && 'Round Robin: les commandes sont assign\u00e9es automatiquement aux agents actifs \u00e0 tour de r\u00f4le.'}
                  {formData.distributionMethod === 'produit' && 'Par Produit: l\'agent re\u00e7oit uniquement les commandes des produits qui lui sont assign\u00e9s.'}
                  {formData.distributionMethod === 'pourcentage' && 'Par Pourcentage: r\u00e9partition proportionnelle selon un pourcentage configur\u00e9.'}
                  {formData.distributionMethod === 'region' && 'Par R\u00e9gion: l\'agent re\u00e7oit les commandes de sa zone g\u00e9ographique.'}
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Switch id="active" checked={formData.isActive} onCheckedChange={(v) => setFormData(d => ({ ...d, isActive: v }))} />
                <label htmlFor="active" className="text-sm font-bold text-muted-foreground">Actif</label>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 bg-muted/20 border-t">
              <Button variant="outline" onClick={() => setOpen(false)} className="px-8">Fermer</Button>
              <Button data-testid="button-save-agent" onClick={handleCreateAgent} disabled={createAgent.isPending} className="px-8">
                {createAgent.isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
            <p className="text-xs font-bold text-muted-foreground uppercase">Confirm\u00e9es</p>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-confirmed">{totalConfirmed}</p>
          </div>
          <div className="w-10 h-10 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg flex items-center justify-center"><CheckCircle className="w-5 h-5" /></div>
        </Card>
        <Card className="p-4 border-border/50 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase">Livr\u00e9es</p>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-delivered">{totalDelivered}</p>
          </div>
          <div className="w-10 h-10 bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg flex items-center justify-center"><Truck className="w-5 h-5" /></div>
        </Card>
        <Card className="p-4 border-border/50 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase">Total Assign\u00e9es</p>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-assigned">{totalAssigned}</p>
          </div>
          <div className="w-10 h-10 bg-blue-100 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg flex items-center justify-center"><Activity className="w-5 h-5" /></div>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6">
          {[1,2].map(i => <div key={i} className="h-40 bg-muted/50 rounded-2xl animate-pulse"></div>)}
        </div>
      ) : (
        <div className="space-y-6">
          <Table className="bg-card rounded-2xl border overflow-hidden">
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead>MEMBRE</TableHead>
                <TableHead>R\u00d4LE</TableHead>
                <TableHead>PAIEMENT</TableHead>
                <TableHead>PERFORMANCE</TableHead>
                <TableHead>STATUT</TableHead>
                <TableHead className="text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    Aucun membre. Cliquez "Ajouter un membre" pour commencer.
                  </TableCell>
                </TableRow>
              ) : agents?.map((agent: any) => {
                const stats = getAgentStats(agent.id);
                const confirmRate = stats.total > 0 ? Math.round((stats.confirmed / stats.total) * 100) : 0;
                const deliveryRate = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0;
                return (
                  <TableRow key={agent.id} className="hover:bg-muted/5" data-testid={`row-agent-${agent.id}`}>
                    <TableCell className="py-6">
                      <div className="flex items-start gap-3">
                        <Avatar className="w-10 h-10 rounded-full">
                          <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${agent.username}`} />
                          <AvatarFallback>{agent.username[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-bold text-lg">{agent.username}</p>
                          <p className="text-xs text-muted-foreground">{agent.email}</p>
                          {agent.phone && <p className="text-xs text-muted-foreground">{agent.phone}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px]", agent.role === 'owner' ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400" : "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400")}>
                        {agent.role === 'owner' ? 'Admin' : 'Agent'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary text-[10px] w-fit capitalize">{agent.paymentType || 'commission'}</Badge>
                        {agent.paymentAmount > 0 && (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-none text-[10px] w-fit dark:bg-yellow-900/20 dark:text-yellow-400">{(agent.paymentAmount / 100).toFixed(2)} MAD</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {agent.role === 'agent' && stats.total > 0 ? (
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Confirm.:</span>
                            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400" data-testid={`text-confirm-rate-${agent.id}`}>{confirmRate}%</Badge>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Livraison:</span>
                            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400" data-testid={`text-delivery-rate-${agent.id}`}>{deliveryRate}%</Badge>
                          </div>
                          <span className="text-muted-foreground">{stats.total} commandes</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{agent.role === 'owner' ? '-' : 'Aucune commande'}</span>
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
                        {agent.role !== 'owner' && (
                          <Button variant="ghost" size="icon" className="w-8 h-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" data-testid={`button-delete-agent-${agent.id}`} onClick={() => handleDeleteAgent(agent.id, agent.username)} disabled={deleteAgent.isPending}>
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
        </div>
      )}

      <Dialog open={!!productDialogAgent} onOpenChange={(open) => { if (!open) setProductDialogAgent(null); }}>
        {productDialogAgent && (
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogTitle className="text-lg font-bold">Assigner des produits \u00e0 {productDialogAgent.username}</DialogTitle>
            <p className="text-sm text-muted-foreground mb-4">
              S\u00e9lectionnez les produits que cet agent peut g\u00e9rer. Les commandes avec ces produits lui seront automatiquement assign\u00e9es.
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
    </div>
  );
}
