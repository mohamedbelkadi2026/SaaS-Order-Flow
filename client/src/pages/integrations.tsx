import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ShoppingBag, Globe, Copy, CheckCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SiShopify, SiWoocommerce, SiMagento } from "react-icons/si";

const INTEGRATION_TYPES = [
  { id: "gsheets", name: "Google Sheets", icon: Globe, color: "text-green-600" },
  { id: "shopify", name: "Shopify", icon: SiShopify, color: "text-[#95BF47]" },
  { id: "youcan", name: "YouCan", icon: ShoppingBag, color: "text-red-500" },
  { id: "storeep", name: "Storeep", icon: ShoppingBag, color: "text-blue-600" },
  { id: "woocommerce", name: "Woocommerce", icon: SiWoocommerce, color: "text-[#96588A]" },
  { id: "lightfunnels", name: "lightfunnels", icon: Globe, color: "text-blue-400" },
  { id: "magento", name: "Magento", icon: SiMagento, color: "text-[#EE672F]" },
];

export default function Integrations() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("gsheets");
  const [understood, setUnderstood] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText("// Google Apps Script for OmniOMS integration\nfunction onEdit(e) {\n  // script implementation\n}");
    toast({ title: "Copied!", description: "Integration script copied to clipboard." });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold uppercase">LIST</h1>
        <div className="text-xs text-muted-foreground">integration / list</div>
      </div>

      <div className="bg-white rounded-xl border border-border/50 shadow-sm overflow-hidden">
        <div className="flex border-b overflow-x-auto no-scrollbar">
          {INTEGRATION_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setActiveTab(type.id)}
              className={cn(
                "flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all whitespace-nowrap border-b-2",
                activeTab === type.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <type.icon className={cn("w-4 h-4", type.color)} />
              {type.name}
            </button>
          ))}
        </div>

        <div className="p-12 bg-[#f8f9fc]">
          <Card className="max-w-3xl mx-auto rounded-xl border-none shadow-md overflow-hidden bg-white">
            <CardHeader className="border-b bg-white py-6">
              <CardTitle className="text-xl font-bold text-slate-800">Guide d'intégration avec Google Sheets</CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="space-y-4">
                <h3 className="text-primary font-bold text-lg">Étapes :</h3>
                <div className="space-y-0 text-slate-600">
                  <div className="py-3 border-b border-slate-100">Ouvrez votre <span className="text-blue-500 cursor-pointer hover:underline">compte Google Sheets</span>.</div>
                  <div className="py-3 border-b border-slate-100">Allez dans <span className="font-medium">Extensions &gt; Apps Script</span>.</div>
                  <div className="py-3 border-b border-slate-100">Cliquez sur le bouton ci-dessous pour copier le script.</div>
                  <div className="py-3 border-b border-slate-100">Collez le script dans l'éditeur Apps Script.</div>
                  <div className="py-3 border-b border-slate-100">Enregistrez le script et exécutez le code.</div>
                  <div className="py-3">Accordez les autorisations à l'application pour accéder à vos données.</div>
                </div>
              </div>

              <div className="text-sm text-blue-500 cursor-pointer hover:underline font-medium">
                Démo : Comment intégrer Google Sheets avec notre application
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4">
                <Button onClick={copyCode} className="bg-blue-600 hover:bg-blue-700 text-white px-8">
                  Copy Code
                </Button>
                
                <div className="flex items-center space-x-2">
                  <Checkbox id="terms" checked={understood} onCheckedChange={(checked) => setUnderstood(!!checked)} />
                  <label htmlFor="terms" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    I understand the steps
                  </label>
                </div>
              </div>

              <Button 
                disabled={!understood}
                className={cn(
                  "w-full h-12 text-white font-bold text-lg transition-all",
                  understood ? "bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-200" : "bg-emerald-300"
                )}
              >
                Verify Connection
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
