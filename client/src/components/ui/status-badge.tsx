import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusType = 'new' | 'confirmed' | 'in_progress' | 'cancelled' | 'delivered' | 'refused';

export function StatusBadge({ status, className }: { status: string, className?: string }) {
  const normalizedStatus = status.toLowerCase() as StatusType;
  
  const variants: Record<StatusType, { label: string; class: string }> = {
    new: { label: "New", class: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
    confirmed: { label: "Confirmed", class: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800" },
    in_progress: { label: "In Progress", class: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800" },
    cancelled: { label: "Cancelled", class: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800" },
    delivered: { label: "Delivered", class: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
    refused: { label: "Refused", class: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700" },
  };

  const config = variants[normalizedStatus] || { label: status, class: "bg-muted text-muted-foreground" };

  return (
    <Badge variant="outline" className={cn("font-medium px-2.5 py-0.5 rounded-md", config.class, className)}>
      {config.label}
    </Badge>
  );
}
