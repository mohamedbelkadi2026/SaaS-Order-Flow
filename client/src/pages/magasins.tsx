import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreVertical, Store, User, CheckCircle2, Truck, Plus, Power } from "lucide-react";
import { SiShopify } from "react-icons/si";
import { Globe } from "lucide-react";

export default function Magasins() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-display font-bold">Mes magasins</h1>
        <Button className="bg-[#58b393] hover:bg-[#4a967b] text-white">
          <Plus className="w-4 h-4 mr-2" /> Ajouter un nouveau business
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden bg-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
                  <Store className="w-6 h-6 text-slate-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg uppercase tracking-tight">PROMOMARKETT</h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="w-3 h-3" /> Mohamed
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                < MoreVertical className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex gap-2 mb-6">
              <Badge variant="outline" className="bg-[#e8f5e9] text-[#2e7d32] border-[#c8e6c9] px-3 py-1 flex items-center gap-1.5 rounded-lg font-medium">
                <div className="w-4 h-4 rounded-full bg-[#4caf50] flex items-center justify-center text-white">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                </div>
                Can open
              </Badge>
              <Badge variant="outline" className="bg-[#f3f0ff] text-[#673ab7] border-[#d1c4e9] px-3 py-1 flex items-center gap-1.5 rounded-lg font-medium">
                <Truck className="w-4 h-4" />
                Ramassage
              </Badge>
            </div>

            <div className="bg-[#f8f9fc] rounded-xl p-4 mb-6">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">ÉQUIPE DE TRAITEMENT</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="font-semibold">Confirmation:</span>
                  <span className="text-muted-foreground">fatima, khawla</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Truck className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold">Suivi:</span>
                  <span className="text-muted-foreground">-</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-slate-400">
                  <Globe className="w-3.5 h-3.5" />
                </div>
                <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[#95BF47]">
                  <SiShopify className="w-3.5 h-3.5" />
                </div>
                <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[#95BF47]">
                  <SiShopify className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex items-center h-6 w-10 bg-[#4caf50] rounded-full relative px-1 cursor-pointer">
                <div className="w-4 h-4 bg-white rounded-full ml-auto shadow-sm"></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
