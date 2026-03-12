import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Target, UserPlus, Loader2, Copy, Check, TrendingUp, ShoppingCart, Truck, DollarSign, Pencil, Trash2, X, ChevronDown, ChevronRight, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function MediaBuyersPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editBuyer, setEditBuyer] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [expandedBuyer, setExpandedBuyer] = useState<number | null>(null);

  const [form, setForm] = useState({ username: '', email: '', password: '', buyerCode: '' });
  const [editForm, setEditForm] = useState({ username: '', email: '', buyerCode: '' });

  if (user?.role !== 'owner') {
    navigate('/');
    return null;
  }

  const { data: buyers = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/media-buyers/summary'] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/agents', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media-buyers/summary'] });
      toast({ title: "Media Buyer créé", description: `${form.username} a été ajouté avec succès.` });
      setShowAddModal(false);
      setForm({ username: '', email: '', password: '', buyerCode: '' });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de créer le media buyer.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest('PUT', `/api/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media-buyers/summary'] });
      toast({ title: "Mis à jour", description: "Le media buyer a été modifié." });
      setEditBuyer(null);
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de modifier.", variant: "destructive" }),
  });

  const handleCreate = () => {
    if (!form.username.trim() || !form.password.trim() || !form.buyerCode.trim()) {
      toast({ title: "Champs requis", description: "Nom, mot de passe et code UTM sont obligatoires.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      username: form.username.trim(),
      email: form.email.trim() || undefined,
      password: form.password,
      role: 'media_buyer',
      buyerCode: form.buyerCode.trim().toUpperCase(),
    });
  };

  const handleUpdate = () => {
    if (!editBuyer || !editForm.buyerCode.trim()) {
      toast({ title: "Code requis", description: "Le code UTM est obligatoire.", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editBuyer.id,
      data: { buyerCode: editForm.buyerCode.trim().toUpperCase() },
    });
  };

  const openEdit = (buyer: any) => {
    setEditBuyer(buyer);
    setEditForm({ username: buyer.username, email: buyer.email || '', buyerCode: buyer.buyerCode || '' });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const totalLeads = buyers.reduce((s: number, b: any) => s + (b.total || 0), 0);
  const totalRevenue = buyers.reduce((s: number, b: any) => s + (b.revenue || 0), 0);
  const avgConfirm = buyers.length > 0 ? Math.round(buyers.reduce((s: number, b: any) => s + (b.confirmRate || 0), 0) / buyers.length) : 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shadow-sm">
            <Target className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold uppercase" data-testid="text-page-title">Gestion Media Buyers</h1>
            <p className="text-xs text-muted-foreground">{buyers.length} media buyer{buyers.length !== 1 ? 's' : ''} enregistré{buyers.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button
          onClick={() => setShowAddModal(true)}
          className="gap-2 bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
          data-testid="button-add-media-buyer"
        >
          <UserPlus className="w-4 h-4" />
          Ajouter un Media Buyer
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="rounded-xl border-border/50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0"><ShoppingCart className="w-4 h-4 text-violet-600" /></div>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Leads</p>
              <p className="text-2xl font-bold">{totalLeads}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0"><TrendingUp className="w-4 h-4 text-green-600" /></div>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Taux Moy. Confirm.</p>
              <p className="text-2xl font-bold text-green-600">{avgConfirm}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/50 shadow-sm col-span-2 md:col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0"><DollarSign className="w-4 h-4 text-emerald-600" /></div>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Revenue Total</p>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : buyers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center">
              <Target className="w-7 h-7 text-violet-400" />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">Aucun media buyer pour l'instant</p>
            <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)} className="gap-2" data-testid="button-add-first">
              <UserPlus className="w-3.5 h-3.5" /> Ajouter le premier
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-violet-50/60 dark:bg-violet-900/10">
              <TableRow>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Nom</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Code UTM</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Total Leads</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Taux Confirm.</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Livrés</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Revenue Généré</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buyers.map((buyer: any) => (
                <Fragment key={buyer.id}>
                  <TableRow className="hover:bg-muted/5 transition-colors" data-testid={`row-buyer-${buyer.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => setExpandedBuyer(expandedBuyer === buyer.id ? null : buyer.id)}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          data-testid={`button-expand-${buyer.id}`}
                        >
                          {expandedBuyer === buyer.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        <Avatar className="w-8 h-8 border border-border">
                          <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${buyer.username}`} />
                          <AvatarFallback className="text-xs font-bold">{buyer.username?.[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-sm">{buyer.username}</p>
                          {buyer.email && <p className="text-xs text-muted-foreground">{buyer.email}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {buyer.buyerCode ? (
                        <div className="flex items-center gap-1.5">
                          <Badge className="bg-violet-100 text-violet-700 border-violet-200 font-mono text-xs">{buyer.buyerCode}</Badge>
                          <button
                            onClick={() => copyCode(buyer.buyerCode)}
                            className="text-muted-foreground hover:text-violet-600 transition-colors"
                            data-testid={`button-copy-code-${buyer.id}`}
                          >
                            {copiedCode === buyer.buyerCode
                              ? <Check className="w-3.5 h-3.5 text-green-500" />
                              : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ) : <span className="text-muted-foreground text-xs italic">Non défini</span>}
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-sm">{buyer.total}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs font-semibold",
                        buyer.confirmRate >= 60 ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : buyer.confirmRate >= 40 ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-red-50 text-red-700 border-red-200"
                      )}>
                        {buyer.confirmRate}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                        {buyer.delivered}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-emerald-600 text-sm">{formatCurrency(buyer.revenue)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => openEdit(buyer)}
                          data-testid={`button-edit-buyer-${buyer.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedBuyer === buyer.id && buyer.platformBreakdown && buyer.platformBreakdown.length > 0 && (
                    <TableRow key={`${buyer.id}-breakdown`} className="bg-violet-50/40 dark:bg-violet-900/5">
                      <TableCell colSpan={7} className="py-3 px-6">
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Monitor className="w-3.5 h-3.5 text-violet-500" />
                            <span className="text-xs font-bold text-violet-600 uppercase tracking-wider">Performance par Plateforme</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {buyer.platformBreakdown.map((pb: any) => (
                              <div key={pb.platform} className="bg-white dark:bg-card border border-border/50 rounded-lg p-3 space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-muted-foreground">{pb.platform}</span>
                                  <Badge variant="outline" className={cn("text-[10px]",
                                    pb.confirmRate >= 60 ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : pb.confirmRate >= 40 ? "bg-amber-50 text-amber-700 border-amber-200"
                                        : "bg-red-50 text-red-700 border-red-200"
                                  )}>{pb.confirmRate}%</Badge>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">{pb.total} leads</span>
                                  <span className="text-blue-600 font-medium">{pb.delivered} livrés</span>
                                </div>
                                <p className="text-xs font-semibold text-emerald-600">{formatCurrency(pb.revenue)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md" data-testid="modal-add-media-buyer">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-violet-600" />
              Ajouter un Media Buyer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="mb-username">Nom d'utilisateur *</Label>
              <Input
                id="mb-username"
                data-testid="input-mb-username"
                placeholder="ex: Soufiane"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-email">Email (optionnel)</Label>
              <Input
                id="mb-email"
                data-testid="input-mb-email"
                type="email"
                placeholder="ex: soufiane@example.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-password">Mot de passe *</Label>
              <Input
                id="mb-password"
                data-testid="input-mb-password"
                type="password"
                placeholder="Mot de passe de connexion"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-code">Code UTM Unique *</Label>
              <Input
                id="mb-code"
                data-testid="input-mb-code"
                placeholder="ex: MB1, SOUF-ADS, YOUSSEF"
                value={form.buyerCode}
                onChange={e => setForm(f => ({ ...f, buyerCode: e.target.value.toUpperCase() }))}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Ce code sera utilisé comme <code className="bg-muted px-1 rounded text-xs">utm_source</code> dans les liens de tracking.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddModal(false)} data-testid="button-cancel-add">Annuler</Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
              data-testid="button-confirm-add"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Créer le compte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editBuyer} onOpenChange={v => !v && setEditBuyer(null)}>
        <DialogContent className="max-w-md" data-testid="modal-edit-media-buyer">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-violet-600" />
              Modifier — {editBuyer?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-mb-code">Code UTM *</Label>
              <Input
                id="edit-mb-code"
                data-testid="input-edit-mb-code"
                placeholder="ex: MB1, SOUF-ADS"
                value={editForm.buyerCode}
                onChange={e => setEditForm(f => ({ ...f, buyerCode: e.target.value.toUpperCase() }))}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Modifier le code UTM unique de ce media buyer. Les commandes avec l'ancien code ne seront pas rétroactivement mises à jour.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditBuyer(null)} data-testid="button-cancel-edit">Annuler</Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
              data-testid="button-confirm-edit"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
