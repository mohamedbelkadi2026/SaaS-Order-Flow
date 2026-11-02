import type {Express} from 'express';
import {storage} from './storage';
import {syncLivcash} from './jobs/livcash-sync';
export function registerLivcashRoutes(app:Express) {
  app.post('/api/shipping/livcash/sync',async(req,res)=>{
    if(!req.isAuthenticated?.() || !req.user?.storeId)return res.sendStatus(401);
    try {return res.json(await syncLivcash(req.user.storeId));}
    catch {return res.status(502).json({message:'Synchronisation Livcash indisponible.'});}
  });
  app.post('/api/carriers/livcash/seed-cities/:accountId',async(req,res)=>{
    if(!req.isAuthenticated?.() || !req.user?.storeId)return res.sendStatus(401);
    try {
      const account=await storage.getCarrierAccount(Number(req.params.accountId));
      if(!account || account.storeId!==req.user.storeId || account.carrierName!=='livcash')return res.sendStatus(404);
      const input=req.body?.cities ?? req.body;
      if(!Array.isArray(input) || !input.length || input.length>2000)return res.status(400).json({message:'Attendu : ["Casablanca", "Agadir"] (2000 villes maximum).'});
      const names=input.map(c=>typeof c==='string' ? c.trim() : String(c?.cityName ?? c?.name ?? c?.ville ?? '').trim());
      if(names.some(n=>!n || n.length>120))return res.status(400).json({message:'Chaque ville doit avoir un nom de 1 à 120 caractères.'});
      const cities=Array.from(new Set(names));
      await storage.upsertCarrierCities(req.user.storeId,'livcash',account.id,cities);
      return res.json({inserted:cities.length,message:`${cities.length} villes importées.`});
    } catch {return res.status(500).json({message:'Import des villes Livcash impossible.'});}
  });
  // No documented webhook/signature: never accept unauthenticated status updates.
  app.post('/api/webhooks/carrier/:storeId/livcash',(_req,res)=>res.sendStatus(405));
}
