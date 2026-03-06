import { useAgents } from "@/hooks/use-store-data";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserPlus, ShoppingBag, CheckCircle, Truck, Activity, Trash2, Settings } from "lucide-react";

export default function Team() {
  const { data: agents, isLoading } = useAgents();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold uppercase">Liste des membres</h1>
          <p className="text-muted-foreground mt-1">Gestion de l'équipe / Membres</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-white rounded-md px-4 py-2 flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Ajouter un membre
        </Button>
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
