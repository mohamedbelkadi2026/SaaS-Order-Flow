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
    if(!name||!Array.isArray(images)||images.length===0) return res.status(400).json({message:"Nom du produit et au moins une photo requis."});
    if(images.length>5) return res.status(400).json({message:"5 images maximum."});
    if(images.some((x:any)=>typeof x!=="string"||x.length>7_000_000)) return res.status(413).json({message:"Image invalide ou trop volumineuse."});

    const prompt=`Create a premium, conversion-focused LONG VERTICAL E-COMMERCE LANDING PAGE INFOGRAPHIC as ONE image for Moroccan COD sales.
Product: ${String(name).slice(0,150)}
Price: ${String(price||"").slice(0,50)}
Product information: ${String(description||"").slice(0,2500)}
Language for visible text: ${language}. Visual style: ${style}.
Use the supplied product reference photos faithfully: preserve product shape, color, proportions and identity. Do not invent a different product.
Dense edge-to-edge professional layout, no empty sections. Structure from top to bottom: strong hero/product headline and price; customer problem; product as solution; key benefits; 3-5 feature callouts; realistic Moroccan lifestyle/use scene when appropriate; trust/COD delivery section; final high-contrast CTA. Keep visible text short, legible and correctly spelled. Mobile-first long infographic suitable for WooCommerce/Shopify/YouCan product page. No website browser chrome, no mock webpage frame.`;

    try{
      const model=process.env.OPENROUTER_IMAGE_MODEL||"google/gemini-2.5-flash-image";
      const content:any[]=[{type:"text",text:prompt},...images.map((url:string)=>({type:"image_url",image_url:{url}}))];
      const upstream=await fetch("https://openrouter.ai/api/v1/chat/completions",{
        method:"POST",
        headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json","HTTP-Referer":process.env.APP_PUBLIC_URL||"https://tajergrow.com","X-Title":"TajerGrow AI Landing Page"},
        body:JSON.stringify({model,messages:[{role:"user",content}],modalities:["image","text"],image_config:{aspect_ratio:"9:16"}})
      });
      const data:any=await upstream.json().catch(()=>({}));
      if(!upstream.ok) return res.status(upstream.status).json({message:data?.error?.message||data?.message||"Erreur OpenRouter"});
      const image=getImageFromResponse(data);
      if(!image) { console.error("[AI-LP] No image in OpenRouter response",JSON.stringify(data).slice(0,1500)); return res.status(502).json({message:"Le modèle n'a retourné aucune image. Configurez OPENROUTER_IMAGE_MODEL avec un modèle image compatible."}); }
      res.json({image,model});
    }catch(err:any){
      console.error("[AI-LP]",err);
      res.status(500).json({message:err?.message||"Erreur de génération"});
    }
  });
}
