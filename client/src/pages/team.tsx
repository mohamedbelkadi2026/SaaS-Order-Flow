import { useState } from "react";
import { useAgents } from "@/hooks/use-store-data";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UserPlus, ShoppingBag, CheckCircle, Truck, Activity, Trash2, Settings, X } from "lucide-react";

export default function Team() {
  const { data: agents, isLoading } = useAgents();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold uppercase">Liste des membres</h1>
          <p className="text-muted-foreground mt-1">Gestion de l'équipe / Membres</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-md px-4 py-2 flex items-center gap-2">
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
            
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Nom complet</label>
                  <Input placeholder="Entrer le nom complet" className="h-11 bg-slate-50/50 border-slate-200" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Téléphone</label>
                  <Input placeholder="ex: 01 23 45 67 89" className="h-11 bg-slate-50/50 border-slate-200" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Adresse e-mail</label>
                  <Input placeholder="ex: 0Glt4@garean.com" className="h-11 bg-slate-50/50 border-slate-200" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Mot de passe</label>
                  <Input type="password" placeholder="••••••••" className="h-11 bg-slate-50/50 border-slate-200" />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Assigner à des magasins et rôles.</p>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Choisir les magasins</label>
                    <Input placeholder="Sélectionner les Botiques" className="h-11 bg-slate-50/50 border-slate-200" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Choisir les rôles</label>
                    <Input placeholder="Sélectionner les Rôles" className="h-11 bg-slate-50/50 border-slate-200" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Type de Paiement</label>
                    <Select defaultValue="commission">
                      <SelectTrigger className="h-11 bg-slate-50/50 border-slate-200">
                        <SelectValue placeholder="Comission" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="commission">Comission</SelectItem>
                        <SelectItem value="fixe">Fixe</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Montant</label>
                    <Input placeholder="Ex: 50.00" className="h-11 bg-slate-50/50 border-slate-200" />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Méthode de répartition</p>
                <div className="grid grid-cols-4 border rounded-lg bg-white overflow-hidden">
                  <button className="py-2.5 text-sm font-bold bg-blue-500 text-white">Auto</button>
                  <button className="py-2.5 text-sm font-medium text-slate-500 border-l hover:bg-slate-50">Pourcentage</button>
                  <button className="py-2.5 text-sm font-medium text-slate-500 border-l hover:bg-slate-50">Produit</button>
                  <button className="py-2.5 text-sm font-medium text-slate-500 border-l hover:bg-slate-50">Région</button>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Switch id="active" defaultChecked className="data-[state=checked]:bg-blue-500" />
                <label htmlFor="active" className="text-sm font-bold text-slate-700">Actif</label>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 bg-slate-50 border-t">
              <Button variant="outline" onClick={() => setOpen(false)} className="px-8 border-slate-300 text-slate-600 bg-white hover:bg-slate-50">Fermer</Button>
              <Button className="px-8 bg-blue-500 hover:bg-blue-600 text-white font-bold">Enregistrer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-4 bg-white border-border/50 shadow-sm flex items-center justify-between">
          <div>
             <p className="text-xs font-bold text-muted-foreground uppercase">Total Commandes</p>
             <p className="text-2xl font-bold mt-1">248</p>
          </div>
          <div className="w-10 h-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
             <ShoppingBag className="w-5 h-5" />
          </div>
        </Card>
        <Card className="p-4 bg-white border-border/50 shadow-sm flex items-center justify-between">
          <div>
             <p className="text-xs font-bold text-muted-foreground uppercase">Confirmées</p>
             <p className="text-2xl font-bold mt-1">19</p>
          </div>
          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
             <CheckCircle className="w-5 h-5" />
          </div>
        </Card>
        <Card className="p-4 bg-white border-border/50 shadow-sm flex items-center justify-between">
          <div>
             <p className="text-xs font-bold text-muted-foreground uppercase">Livrées</p>
             <p className="text-2xl font-bold mt-1">20</p>
          </div>
          <div className="w-10 h-10 bg-blue-500 text-white rounded-lg flex items-center justify-center">
             <Truck className="w-5 h-5" />
          </div>
        </Card>
        <Card className="p-4 bg-white border-border/50 shadow-sm flex items-center justify-between">
          <div>
             <p className="text-xs font-bold text-muted-foreground uppercase">Activités</p>
             <p className="text-2xl font-bold mt-1">56</p>
          </div>
          <div className="w-10 h-10 bg-blue-400 text-white rounded-lg flex items-center justify-center">
             <Activity className="w-5 h-5" />
          </div>
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
                 <TableHead>ASSIGNATIONS</TableHead>
                 <TableHead>PERFORMANCE DU JOUR</TableHead>
                 <TableHead>STATUT EN LIGNE</TableHead>
                 <TableHead className="text-right">ACTIONS</TableHead>
               </TableRow>
             </TableHeader>
             <TableBody>
               {agents?.map((agent: any) => (
                 <TableRow key={agent.id} className="hover:bg-muted/5">
                   <TableCell className="py-6">
                     <div className="flex items-start gap-3">
                       <Avatar className="w-10 h-10 rounded-full">
                         <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${agent.username}`} />
                         <AvatarFallback>{agent.username[0]}</AvatarFallback>
                       </Avatar>
                       <div>
                         <p className="font-bold text-lg">{agent.username}</p>
                         <p className="text-xs text-muted-foreground">{agent.username}@gmail.com</p>
                         <p className="text-xs text-muted-foreground mt-1 italic">MÉTHODE DE RÉPARTITION</p>
                         <div className="flex gap-2 mt-1">
                           <Badge variant="outline" className="text-primary border-primary bg-primary/5 text-[10px]">Pourcentage</Badge>
                           <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-none text-[10px]">50.00 %</Badge>
                         </div>
                       </div>
                     </div>
                   </TableCell>
                   <TableCell>
                     <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="bg-blue-50 text-blue-600 border-none text-[10px] w-fit">promomarkett</Badge>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="bg-blue-100 text-blue-700 border-none text-[10px]">Confirmation</Badge>
                          <Badge variant="outline" className="bg-blue-50 text-blue-500 border-none text-[10px]">Suivi</Badge>
                        </div>
                     </div>
                   </TableCell>
                   <TableCell>
                     <div className="flex gap-6 items-center">
                        <div className="text-center">
                          <p className="text-lg font-bold">24</p>
                          <p className="text-[10px] text-muted-foreground uppercase">Traitées</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-blue-600">14</p>
                          <p className="text-[10px] text-muted-foreground uppercase">Confirmées</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-green-600">12</p>
                          <p className="text-[10px] text-muted-foreground uppercase">Livrées</p>
                        </div>
                        <div className="text-center ml-4">
                          <p className="text-lg font-bold">85.71%</p>
                          <p className="text-[10px] text-muted-foreground uppercase">Tx Liv</p>
                        </div>
                     </div>
                   </TableCell>
                   <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                        <span className="text-xs font-medium text-muted-foreground">5 min ago</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground ml-4">Actions: 31</p>
                   </TableCell>
                   <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <div className="w-10 h-5 bg-blue-500 rounded-full relative"><div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div></div>
                        <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground"><Settings className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="w-8 h-8 text-red-500"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                   </TableCell>
                 </TableRow>
               ))}
             </TableBody>
           </Table>
        </div>
      )}
    </div>
  );
}
