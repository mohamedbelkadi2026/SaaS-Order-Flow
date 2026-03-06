import { FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Invoices() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 h-[80vh] flex flex-col">
      <div>
        <h1 className="text-3xl font-display font-bold">Invoices</h1>
        <p className="text-muted-foreground mt-1">Manage billing and generated invoices.</p>
      </div>

      <div className="flex-1 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-center p-8 bg-muted/10">
        <div className="w-16 h-16 bg-background rounded-full flex items-center justify-center shadow-sm border border-border mb-4">
          <FileText className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No invoices generated</h2>
        <p className="text-muted-foreground max-w-md mb-6">
          Invoices will appear here automatically when orders are marked as delivered and billing cycles are processed.
        </p>
        <Button variant="outline">Configure Billing Settings</Button>
      </div>
    </div>
  );
}
