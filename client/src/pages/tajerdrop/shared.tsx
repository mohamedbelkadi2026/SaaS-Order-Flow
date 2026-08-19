import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertCircle, ArrowRight, Loader2, PackageOpen } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export const GOLD = "#c49a55";
export const NAVY = "#10243d";
export const INK = "#18324a";
export const MINT = "#dceee8";

export function useJson<T>(url: string, options?: { enabled?: boolean }) {
  return useQuery<T>({ queryKey: [url], queryFn: async () => {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error("Impossible de charger ces données");
    return r.json();
  }, ...options });
}
export function Loading() { return <div className="space-y-3 py-8"><div className="h-7 w-48 rounded bg-slate-200 animate-pulse"/><div className="h-28 rounded-xl bg-slate-200/70 animate-pulse"/><div className="h-28 rounded-xl bg-slate-200/70 animate-pulse"/></div>; }
export function ErrorState({ retry }: { retry?: () => void }) { return <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-800"><AlertCircle className="mx-auto mb-2 h-7 w-7"/><p className="font-semibold">Les données ne sont pas disponibles</p><button onClick={retry} className="mt-3 text-sm underline">Réessayer</button></div>; }
export function Empty({ title, text, href, action }: { title: string; text: string; href?: string; action?: string }) { return <div className="rounded-2xl border border-dashed border-[#c49a55]/40 bg-[#fffaf0] p-12 text-center"><PackageOpen className="mx-auto mb-3 h-9 w-9 text-[#c49a55]"/><h3 className="font-semibold text-[#10243d]">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{text}</p>{href && <Link href={href} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#10243d] px-4 py-2 text-sm font-semibold text-white">{action}<ArrowRight className="h-4 w-4"/></Link>}</div>; }
export function PageHead({ eyebrow, title, text }: { eyebrow?: string; title: string; text?: string }) { return <div className="mb-6"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#c49a55]">{eyebrow || "TAJERDROP · SELLER"}</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-[#10243d]">{title}</h1>{text && <p className="mt-1 text-sm text-slate-500">{text}</p>}</div>; }
export function money(n?: number) { return formatCurrency(Number(n || 0)); }