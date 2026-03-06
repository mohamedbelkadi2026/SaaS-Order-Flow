import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Play, Settings, Trash2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const SHIPPING_PROVIDERS = [
  { name: "Digylog", cities: 581, connected: true },
  { name: "Onessta", cities: 378, connected: false },
  { name: "OzoneExpress", cities: 628, connected: false },
  { name: "Sendit", cities: 500, connected: false },
  { name: "Speedex", cities: 439, connected: false },
  { name: "kargoexpress", cities: 335, connected: false },
  { name: "Forcelog", cities: 468, connected: false },
  { name: "Livo", cities: 369, connected: false },
  { name: "Quicklivraison", cities: 404, connected: false },
];

export default function ShippingIntegrations() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SHIPPING_PROVIDERS.map((provider) => (
          <Card key={provider.name} className="relative rounded-xl border border-border/50 shadow-sm overflow-hidden bg-white hover:shadow-md transition-shadow">
            {provider.connected && (
              <div className="absolute top-0 right-0 z-10">
                <div className="bg-emerald-500 text-white text-[10px] font-bold px-8 py-1 rotate-45 translate-x-6 -translate-y-1 shadow-sm flex items-center gap-1 justify-center w-32">
                  <CheckCircle className="w-2.5 h-2.5" /> Connected
                </div>
              </div>
            )}
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center font-bold text-primary text-xl">
                  {provider.name[0]}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800">{provider.name}</h3>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Link2 className="w-3 h-3" /> {provider.name} Link
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{provider.cities} Cities</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                {provider.connected ? (
                  <>
                    <Button variant="outline" size="icon" className="w-10 h-10 rounded-lg text-slate-500 border-slate-200">
                      <Settings className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="w-10 h-10 rounded-lg text-emerald-500 border-emerald-200 bg-emerald-50/50">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <Button className="flex-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg h-10 font-bold gap-2">
                    <Link2 className="w-4 h-4" /> Connect
                  </Button>
                )}
                
                {!provider.connected && (
                  <button className="flex items-center gap-1.5 text-xs text-blue-600 font-bold px-3 hover:underline">
                    <Play className="w-3 h-3 fill-current" /> How to Connect
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CheckCircle({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="3" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Plus({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
