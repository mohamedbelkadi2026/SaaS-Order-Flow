import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, Loader2, Download, Sparkles, Upload, X } from "lucide-react";

export default function AdminAiLandingPages() {
  const { toast } = useToast();
  const [images,setImages]=useState<string[]>([]);
  const [name,setName]=useState("");
  const [price,setPrice]=useState("");
  const [description,setDescription]=useState("");
  const [language,setLanguage]=useState("darija");
  const [style,setStyle]=useState("ecommerce");
  const [result,setResult]=useState<string|null>(null);

  const generate=useMutation({
    mutationFn: async()=> {
      const r=await apiRequest("POST","/api/admin/ai-landing-pages/generate",{name,price,description,language,style,images});
      return r.json();
    },
    onSuccess:(d:any)=>setResult(d.image),
    onError:(e:any)=>toast({title:"Génération impossible",description:e?.message||"Vérifiez OPENROUTER_API_KEY et les crédits.",variant:"destructive"})
  });

  const onFiles=(files:FileList|null)=>{
    if(!files) return;
    [...files].slice(0,5-images.length).forEach(f=>{
      if(f.size>5*1024*1024){toast({title:"Image trop grande",description:"5 MB maximum par image.",variant:"destructive"});return;}
      const rd=new FileReader(); rd.onload=()=>setImages(v=>[...v,String(rd.result)].slice(0,5)); rd.readAsDataURL(f);
    });
  };

  return <div className="min-h-screen bg-[#0f1e38] text-white p-4 sm:p-7">
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6"><div className="w-11 h-11 rounded-xl bg-[#C5A059]/15 flex items-center justify-center"><Sparkles className="text-[#C5A059]"/></div><div><h1 className="text-2xl font-bold">AI Landing Page Studio</h1><p className="text-white/45 text-sm">Super Admin uniquement · test avant activation pour les utilisateurs</p></div></div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-white/10 bg-[#162847] p-5 space-y-4">
          <label className="block"><span className="text-xs text-white/60">Photos produit (1–5)</span><div className="mt-2 border-2 border-dashed border-white/15 rounded-xl p-4"><input id="ai-lp-files" className="hidden" type="file" accept="image/*" multiple onChange={e=>onFiles(e.target.files)}/><label htmlFor="ai-lp-files" className="cursor-pointer flex items-center justify-center gap-2 text-sm text-white/70"><Upload className="w-4 h-4"/>Ajouter des images</label><div className="grid grid-cols-5 gap-2 mt-3">{images.map((im,i)=><div className="relative aspect-square" key={i}><img src={im} className="w-full h-full object-cover rounded-lg"/><button onClick={()=>setImages(v=>v.filter((_,j)=>j!==i))} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5"><X className="w-3 h-3"/></button></div>)}</div></div></label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nom du produit" className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5"/>
          <input value={price} onChange={e=>setPrice(e.target.value)} placeholder="Prix, ex: 199 DH" className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5"/>
          <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description, avantages, cible..." rows={5} className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5"/>
          <div className="grid grid-cols-2 gap-3"><select value={language} onChange={e=>setLanguage(e.target.value)} className="bg-[#0f1e38] border border-white/15 rounded-xl px-3 py-2.5"><option value="darija">Darija</option><option value="ar">العربية</option><option value="fr">Français</option></select><select value={style} onChange={e=>setStyle(e.target.value)} className="bg-[#0f1e38] border border-white/15 rounded-xl px-3 py-2.5"><option value="ecommerce">E-commerce Premium</option><option value="clean">Clean</option><option value="luxury">Luxury</option><option value="bold">Bold Ads</option></select></div>
          <button disabled={generate.isPending||!name||images.length===0} onClick={()=>generate.mutate()} className="w-full rounded-xl py-3 font-bold bg-gradient-to-r from-[#C5A059] to-[#a07840] disabled:opacity-40 flex justify-center items-center gap-2">{generate.isPending?<Loader2 className="animate-spin w-4 h-4"/>:<Sparkles className="w-4 h-4"/>}{generate.isPending?"Génération en cours…":"Générer avec AI"}</button>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#162847] p-5 min-h-[560px]">
          <div className="flex items-center justify-between mb-4"><h2 className="font-semibold flex items-center gap-2"><ImagePlus className="w-4 h-4 text-[#C5A059]"/>Preview</h2>{result&&<a href={result} download="landing-page.png" className="text-xs px-3 py-2 rounded-lg bg-[#C5A059] text-[#0f1e38] font-bold flex gap-1 items-center"><Download className="w-3.5 h-3.5"/>Télécharger</a>}</div>
          {result?<img src={result} className="w-full rounded-xl"/>:<div className="h-[480px] rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center text-white/25"><ImagePlus className="w-12 h-12 mb-3"/><p>La landing page générée apparaîtra ici</p></div>}
        </div>
      </div>
    </div>
  </div>;
}
