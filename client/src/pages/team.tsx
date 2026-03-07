import { useState } from "react";
import { useAgents, useCreateAgent, useAgentPerformance, useDeleteAgent } from "@/hooks/use-store-data";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UserPlus, ShoppingBag, CheckCircle, Truck, Activity, Trash2, Settings, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Team() {
  const { data: agents, isLoading } = useAgents();
  const { data: performance } = useAgentPerformance();
  const createAgent = useCreateAgent();
  const deleteAgent = useDeleteAgent();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

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
          <DialogContent className="sm:max-w-3xl p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-white">
            <div className="flex justify-between items-center p-6 border-b bg-white">
              <h2 className="text-xl font-bold text-slate-800">Ajouter un nouveau membre</h2>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="rounded-full">
                <X className="w-5 h-5 text-slate-400" />
              </Button>
            </div>
            
            <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Nom complet</label>
                  <Input data-testid="input-agent-name" value={formData.username} onChange={(e) => setFormData(d => ({ ...d, username: e.target.value }))} className="h-11 bg-slate-50/50 border-slate-200" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">T\u00e9l\u00e9phone</label>
                  <Input data-testid="input-agent-phone" placeholder="ex: 01 23 45 67 89" value={formData.phone} onChange={(e) => setFormData(d => ({ ...d, phone: e.target.value }))} className="h-11 bg-slate-50/50 border-slate-200" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Adresse e-mail</label>
                  <Input data-testid="input-agent-email" type="email" placeholder="ex: agent@garean.com" value={formData.email} onChange={(e) => setFormData(d => ({ ...d, email: e.target.value }))} className="h-11 bg-slate-50/50 border-slate-200" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Mot de passe</label>
                  <Input data-testid="input-agent-password" type="password" value={formData.password} onChange={(e) => setFormData(d => ({ ...d, password: e.target.value }))} className="h-11 bg-slate-50/50 border-slate-200" />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Assigner \u00e0 des magasins et r\u00f4les.</p>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Choisir les magasins</label>
                    <Input placeholder="S\u00e9lectionner les Botiques" className="h-11 bg-slate-50/50 border-slate-200" readOnly />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Choisir les r\u00f4les</label>
                    <Input placeholder="Agent (Confirmation)" className="h-11 bg-slate-50/50 border-slate-200" readOnly />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Type de Paiement</label>
                    <Select value={formData.paymentType} onValueChange={(v) => setFormData(d => ({ ...d, paymentType: v }))}>
                      <SelectTrigger className="h-11 bg-slate-50/50 border-slate-200" data-testid="select-payment-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="commission">Comission</SelectItem>
                        <SelectItem value="fixe">Fixe</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Montant</label>
                    <Input data-testid="input-agent-amount" placeholder="Ex: 50.00" value={formData.paymentAmount} onChange={(e) => setFormData(d => ({ ...d, paymentAmount: e.target.value }))} className="h-11 bg-slate-50/50 border-slate-200" />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">M\u00e9thode de r\u00e9partition</p>
                <div className="grid grid-cols-4 border rounded-lg bg-white overflow-hidden">
                  {["auto", "pourcentage", "produit", "region"].map((method) => (
                    <button key={method} type="button" onClick={() => setFormData(d => ({ ...d, distributionMethod: method }))} className={cn("py-2.5 text-sm font-medium border-l first:border-l-0", formData.distributionMethod === method ? "bg-blue-500 text-white font-bold" : "text-slate-500 hover:bg-slate-50")}>
                      {method.charAt(0).toUpperCase() + method.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Switch id="active" checked={formData.isActive} onCheckedChange={(v) => setFormData(d => ({ ...d, isActive: v }))} className="data-[state=checked]:bg-blue-500" />
                <label htmlFor="active" className="text-sm font-bold text-slate-700">Actif</label>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 bg-slate-50 border-t">
              <Button variant="outline" onClick={() => setOpen(false)} className="px-8 border-slate-300 text-slate-600 bg-white hover:bg-slate-50">Fermer</Button>
              <Button data-testid="button-save-agent" onClick={handleCreateAgent} disabled={createAgent.isPending} className="px-8 bg-blue-500 hover:bg-blue-600 text-white font-bold">
                {createAgent.isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-4 bg-white border-border/50 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase">Total Agents</p>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-members">{totalAgents}</p>
          </div>
          <div className="w-10 h-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center"><ShoppingBag className="w-5 h-5" /></div>
        </Card>
        <Card className="p-4 bg-white border-border/50 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase">Confirm\u00e9es</p>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-confirmed">{totalConfirmed}</p>
          </div>
          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center"><CheckCircle className="w-5 h-5" /></div>
        </Card>
        <Card className="p-4 bg-white border-border/50 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase">Livr\u00e9es</p>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-delivered">{totalDelivered}</p>
          </div>
          <div className="w-10 h-10 bg-blue-500 text-white rounded-lg flex items-center justify-center"><Truck className="w-5 h-5" /></div>
        </Card>
        <Card className="p-4 bg-white border-border/50 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase">Total Assign\u00e9es</p>
            <p className="text-2xl font-bold mt-1" data-testid="text-total-assigned">{totalAssigned}</p>
          </div>
          <div className="w-10 h-10 bg-blue-400 text-white rounded-lg flex items-center justify-center"><Activity className="w-5 h-5" /></div>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6">
          {[1,2].map(i => <div key={i} className="h-40 bg-muted/50 rounded-2xl animate-pulse"></div>)}
        </div>
      ) : (
        <div className="space-y-6">
          <Table className="bg-white rounded-2xl border overflow-hidden">
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
                      <Badge variant="outline" className={cn("text-[10px]", agent.role === 'owner' ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-blue-50 text-blue-600 border-blue-200")}>
                        {agent.role === 'owner' ? 'Admin' : 'Agent'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary text-[10px] w-fit capitalize">{agent.paymentType || 'commission'}</Badge>
                        {agent.paymentAmount > 0 && (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-none text-[10px] w-fit">{(agent.paymentAmount / 100).toFixed(2)} MAD</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {agent.role === 'agent' && stats.total > 0 ? (
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Confirm.:</span>
                            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200" data-testid={`text-confirm-rate-${agent.id}`}>{confirmRate}%</Badge>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Livraison:</span>
                            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200" data-testid={`text-delivery-rate-${agent.id}`}>{deliveryRate}%</Badge>
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
        </div>
      )}
    </div>
  );
}
