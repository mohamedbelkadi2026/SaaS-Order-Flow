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
  app.post("/api/admin/ai-landing-pages/generate", async (req:Request,res:Response)=>{
    if(!onlySuperAdmin(req,res)) return;
    const key=process.env.OPENROUTER_API_KEY;
    if(!key) return res.status(503).json({message:"OPENROUTER_API_KEY n'est pas configurée sur le serveur."});
    const {name,price,description,language="darija",style="ecommerce",images=[]}=req.body||{};
    if(!Array.isArray(images)||images.length===0) return res.status(400).json({message:"Ajoutez au moins une photo du produit."});
    if(images.length>5) return res.status(400).json({message:"5 images maximum."});
    if(images.some((x:any)=>typeof x!=="string"||x.length>7_000_000)) return res.status(413).json({message:"Image invalide ou trop volumineuse."});

    const prompt=`FIRST analyze the supplied product reference photos visually. If Product name or Product information below is empty, infer the likely product identity, use, visible features, target customer and customer problem from the images. Never invent exact specifications, certifications, safety claims, materials, accessories or performance numbers that are not visible/readable in the reference or explicitly supplied. Then create a premium, conversion-focused LONG VERTICAL E-COMMERCE LANDING PAGE INFOGRAPHIC for Moroccan COD sales.
Product: ${String(name).slice(0,150)}
Price: ${String(price||"").slice(0,50)}
Product information: ${String(description||"").slice(0,2500)}
Language for visible text: ${language}. If language is darija, write natural Moroccan Darija in Arabic script, with short readable sales copy. Visual style: ${style}. Derive the background, accent colors and visual identity from the dominant colors of the supplied product itself.
Use the supplied product reference photos faithfully: preserve product shape, color, proportions and identity. Do not invent a different product.
Dense edge-to-edge professional layout, no empty sections. Follow this 3-part storytelling structure inside the long composition: PART 1 hero + detailed benefit subtitle + problem agitation with 3 muted problem scenes + reassurance lifestyle solution; PART 2 target audience/ease-of-use + macro functional close-up + truthful comparison against conventional methods without fabricated numbers; PART 3 verified specs/details only + 3 mini-features + massive COD trust/CTA footer. If a template section is not relevant to the detected product, adapt it truthfully instead of inventing a feature. Show price only when the user supplied one. Keep visible text short, legible and correctly spelled. Mobile-first long infographic suitable for WooCommerce/Shopify/YouCan product page. No website browser chrome, no mock webpage frame.`;

    try{
      const model=process.env.OPENROUTER_IMAGE_MODEL?.trim() || undefined; // empty = OpenRouter account Default Model
      const sections=[
        "PART 1 ONLY. Hero + product headline/subtitle + problem agitation with 3 muted problem scenes + reassurance lifestyle solution. Do not include Part 2 or Part 3.",
        "PART 2 ONLY. Continue the exact same product identity, palette and visual system. Target audience/ease-of-use + macro functional close-up + truthful comparison against conventional methods. Do not include Part 1 or Part 3.",
        "PART 3 ONLY. Continue the exact same product identity, palette and visual system. Verified specs/details only + 3 mini-features + massive Moroccan COD trust/CTA footer. Show price only if supplied. Do not include Part 1 or Part 2."
      ];
      const generated:string[]=[];
      let usedModel:string|undefined=model;
      for(const section of sections){
        const sectionPrompt=prompt+"\n\nIMPORTANT OUTPUT INSTRUCTION: "+section+" Generate ONE 9:16 vertical infographic image for this section.";
        const content:any[]=[{type:"text",text:sectionPrompt},...images.map((url:string)=>({type:"image_url",image_url:{url}}))];
        const payload:any={messages:[{role:"user",content}],modalities:["image","text"],image_config:{aspect_ratio:"9:16"}};
        if(model) payload.model=model;
        const upstream=await fetch("https://openrouter.ai/api/v1/chat/completions",{
          method:"POST",
          headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json","HTTP-Referer":process.env.APP_PUBLIC_URL||"https://tajergrow.com","X-Title":"TajerGrow AI Landing Page"},
          body:JSON.stringify(payload)
        });
        const data:any=await upstream.json().catch(()=>({}));
        if(!upstream.ok) return res.status(upstream.status).json({message:data?.error?.message||data?.message||"Erreur OpenRouter"});
        const image=getImageFromResponse(data);
        if(!image) { console.error("[AI-LP] No image in OpenRouter response",JSON.stringify(data).slice(0,1500)); return res.status(502).json({message:"Le modèle OpenRouter par défaut n'a retourné aucune image. Choisissez un modèle image compatible."}); }
        generated.push(image);
        usedModel=data?.model||usedModel;
      }
      res.json({images:generated,image:generated[0],model:usedModel||"OpenRouter Default Model"});
    }catch(err:any){
      console.error("[AI-LP]",err);
      res.status(500).json({message:err?.message||"Erreur de génération"});
    }
  });
}
