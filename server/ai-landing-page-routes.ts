import type { Express, Request, Response } from "express";

function onlySuperAdmin(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ message: "Non authentifié" }); return false; }
  if (!(req.user as any).isSuperAdmin) { res.status(403).json({ message: "Super Admin uniquement" }); return false; }
  return true;
}
function getImageFromResponse(data:any): string | null {
  const candidates=[
    data?.data?.[0]?.url, data?.data?.[0]?.b64_json ? `data:image/png;base64,${data.data[0].b64_json}` : null,
    data?.images?.[0]?.url, data?.images?.[0]?.image_url?.url,
    data?.choices?.[0]?.message?.images?.[0]?.image_url?.url,
    data?.choices?.[0]?.message?.images?.[0]?.url,
  ];
  return candidates.find((v:any)=>typeof v==="string"&&v.length>20)||null;
}

export function registerAiLandingPageRoutes(app: Express) {
  app.post("/api/admin/ai-landing-pages/generate-part", async (req:Request,res:Response)=>{
    if(!onlySuperAdmin(req,res)) return;
    const key=process.env.OPENROUTER_API_KEY;
    if(!key) return res.status(503).json({message:"OPENROUTER_API_KEY n'est pas configurée sur le serveur."});
    const {name="",price="",description="",language="darija",style="ecommerce",images=[],part}=req.body||{};
    const partNumber=Number(part);
    if(![1,2,3].includes(partNumber)) return res.status(400).json({message:"Part invalide."});
    if(!Array.isArray(images)||images.length===0) return res.status(400).json({message:"Ajoutez au moins une photo du produit."});
    if(images.length>5) return res.status(400).json({message:"5 images maximum."});
    if(images.some((x:any)=>typeof x!=="string"||x.length>7_000_000)) return res.status(413).json({message:"Image invalide ou trop volumineuse."});

    const basePrompt=`FIRST analyze the supplied product reference photos visually. If Product name or Product information below is empty, infer the likely product identity, use, visible features, target customer and customer problem from the images. Never invent exact specifications, certifications, safety claims, materials, accessories or performance numbers that are not visible/readable in the reference or explicitly supplied.
Product: ${String(name).slice(0,150)}
Price: ${String(price||"").slice(0,50)}
Product information: ${String(description||"").slice(0,2500)}
Language for visible text: ${language}. If language is darija, write natural Moroccan Darija in Arabic script, with short readable sales copy. Visual style: ${style}. Derive the background, accent colors and visual identity from the dominant colors of the supplied product itself.
Use the supplied product reference photos faithfully: preserve product shape, color, proportions and identity. Do not invent a different product. Dense edge-to-edge professional layout, no empty sections. Keep visible text short, legible and correctly spelled. Mobile-first infographic suitable for WooCommerce/Shopify/YouCan. No browser chrome or mock webpage frame.`;

    const sectionPrompts:Record<number,string>={
      1:"PART 1 ONLY. Hero + product headline/subtitle + problem agitation with 3 muted problem scenes + reassurance lifestyle solution. Do not include Part 2 or Part 3.",
      2:"PART 2 ONLY. Continue the same product identity and product-derived palette. Target audience/ease-of-use + macro functional close-up + truthful comparison against conventional methods without fabricated numerical claims. Do not include Part 1 or Part 3.",
      3:"PART 3 ONLY. Continue the same product identity and product-derived palette. Verified specs/details only + 3 mini-features + massive Moroccan COD trust/CTA footer. Show price only if supplied. Do not include Part 1 or Part 2."
    };

    try{
      const model=process.env.OPENROUTER_IMAGE_MODEL?.trim() || undefined;
      const sectionPrompt=basePrompt+"\n\nIMPORTANT OUTPUT INSTRUCTION: "+sectionPrompts[partNumber]+" Generate ONE 9:16 vertical infographic image for this section.";
      const content:any[]=[{type:"text",text:sectionPrompt},...images.map((url:string)=>({type:"image_url",image_url:{url}}))];
      const payload:any={messages:[{role:"user",content}],modalities:["image","text"],image_config:{aspect_ratio:"9:16"}};
      if(model) payload.model=model;
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),115_000);
      let upstream:globalThis.Response;
      try{
        upstream=await fetch("https://openrouter.ai/api/v1/chat/completions",{
          method:"POST",
          headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json","HTTP-Referer":process.env.APP_PUBLIC_URL||"https://tajergrow.com","X-Title":"TajerGrow AI Landing Page"},
          body:JSON.stringify(payload),
          signal:controller.signal
        });
      } finally { clearTimeout(timer); }
      const data:any=await upstream.json().catch(()=>({}));
      if(!upstream.ok) return res.status(upstream.status).json({message:data?.error?.message||data?.message||`OpenRouter error ${upstream.status}`,part:partNumber});
      const image=getImageFromResponse(data);
      if(!image) return res.status(502).json({message:"Le modèle OpenRouter n'a retourné aucune image.",part:partNumber});
      res.json({image,part:partNumber,model:data?.model||model||"OpenRouter Default Model"});
    }catch(err:any){
      console.error("[AI-LP PART]",partNumber,err);
      const timedOut=err?.name==="AbortError";
      res.status(timedOut?504:500).json({message:timedOut?"La génération a dépassé 115 secondes. Réessayez cette partie.":(err?.message||"Erreur de génération"),part:partNumber});
    }
  });
}
