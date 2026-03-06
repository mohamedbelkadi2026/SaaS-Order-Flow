import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Webhook, ShoppingBag, Truck, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Integrations() {
  const { toast } = useToast();
  const webhookUrl = `${window.location.origin}/api/webhooks/shopify`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast({ title: "Copied!", description: "Webhook URL copied to clipboard." });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl">
      <div>
        <h1 className="text-3xl font-display font-bold">Integrations</h1>
        <p className="text-muted-foreground mt-1">Connect your store to external platforms and shipping providers.</p>
      </div>

      <div className="grid gap-6">
        {/* Shopify Integration */}
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <div className="md:w-1/3 bg-slate-50 dark:bg-slate-900/50 p-8 flex flex-col justify-center items-center text-center border-r border-border/50">
              <div className="w-16 h-16 bg-[#95BF47]/20 rounded-2xl flex items-center justify-center mb-4">
                <ShoppingBag className="w-8 h-8 text-[#95BF47]" />
              </div>
              <h3 className="font-bold text-lg">Shopify</h3>
              <p className="text-sm text-muted-foreground mt-2">Sync orders automatically in real-time.</p>
            </div>
            <div className="p-8 md:w-2/3">
              <h4 className="font-medium mb-2">Webhook Connection</h4>
              <p className="text-sm text-muted-foreground mb-6">
                Paste this URL into your Shopify Admin under Settings {'>'} Notifications {'>'} Webhooks to automatically push new orders to OmniOMS.
              </p>
              
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Endpoint URL (POST)</label>
                <div className="flex gap-2">
                  <Input readOnly value={webhookUrl} className="bg-muted font-mono text-sm" />
                  <Button onClick={copyToClipboard}>Copy</Button>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Ready to receive events
              </div>
            </div>
          </div>
        </Card>

        {/* Shipping Integrations Placeholder */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-2xl border-border/50 hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded-lg flex items-center justify-center mb-2">
                <Truck className="w-5 h-5" />
              </div>
              <CardTitle>Eco-track (Morocco)</CardTitle>
              <CardDescription>Connect to automatically generate shipping labels.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">Configure Connection <ExternalLink className="w-3 h-3 ml-2" /></Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg flex items-center justify-center mb-2">
                <Truck className="w-5 h-5" />
              </div>
              <CardTitle>Catsh (Morocco)</CardTitle>
              <CardDescription>Seamless dispatch and tracking status sync.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">Configure Connection <ExternalLink className="w-3 h-3 ml-2" /></Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
