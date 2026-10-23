import type { Express, RequestHandler } from "express";
import type { Product, InsertProduct } from "@shared/schema";

type ProductStore = {
  getProductsByStore(storeId: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined>;
};

function content(product: Product) {
  const urls = (many: string[] | null, one: string | null) => many?.length ? many : one ? [one] : [];
  return {
    id: product.id, name: product.name, sku: product.sku, sellingPrice: product.sellingPrice,
    whatsappDescription: product.whatsappDescription, whatsappPrice: product.whatsappPrice,
    whatsappImageUrls: urls(product.whatsappImageUrls, product.whatsappImageUrl),
    whatsappAudioUrls: urls(product.whatsappAudioUrls, product.whatsappAudioUrl),
    whatsappVideoUrls: urls(product.whatsappVideoUrls, product.whatsappVideoUrl),
  };
}

export function registerWhatsappContentRoutes(app: Express, requireAuth: RequestHandler, storage: ProductStore) {
  app.get("/api/whatsapp-content/products", requireAuth, async (req: any, res: any) => {
    try {
      if (!req.user?.storeId) return res.status(403).json({ message: "Magasin introuvable." });
      const products = await storage.getProductsByStore(req.user.storeId);
      res.set("Cache-Control", "no-store");
      res.json(products.filter(p => !p.archivedAt).map(content));
    } catch { res.status(500).json({ message: "Impossible de charger les produits WhatsApp." }); }
  });

  app.patch("/api/whatsapp-content/products/:id", requireAuth, async (req: any, res: any) => {
    try {
      const id = Number(req.params.id);
      if (!req.user?.storeId) return res.status(403).json({ message: "Magasin introuvable." });
      if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: "Produit invalide." });
      const product = await storage.getProduct(id);
      if (!product || product.storeId !== req.user.storeId || product.archivedAt) return res.status(404).json({ message: "Produit introuvable." });
      const input = req.body ?? {};
      const data: Partial<InsertProduct> = {};
      if (input.whatsappDescription !== undefined) {
        if (input.whatsappDescription !== null && (typeof input.whatsappDescription !== "string" || input.whatsappDescription.length > 20000)) {
          return res.status(400).json({ message: "Description invalide." });
        }
        data.whatsappDescription = input.whatsappDescription;
      }
      if (input.whatsappPriceDh !== undefined) {
        const price = input.whatsappPriceDh;
        if (price !== null && (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 21474836.47)) {
          return res.status(400).json({ message: "Prix invalide." });
        }
        data.whatsappPrice = price === null ? null : Math.round(price * 100);
      }
      for (const field of ["whatsappImageUrls", "whatsappAudioUrls", "whatsappVideoUrls"] as const) {
        if (input[field] === undefined) continue;
        const urls = input[field];
        if (!Array.isArray(urls) || urls.length > 50 || urls.some((url: unknown) => typeof url !== "string" || url.length > 4096 || !/^(https?:\/\/|\/uploads\/)/.test(url))) {
          return res.status(400).json({ message: "Liens des médias invalides." });
        }
        data[field] = urls;
        // Keep single-media fallbacks consistent when the last file is removed.
        const legacyField = field === "whatsappImageUrls" ? "whatsappImageUrl" : field === "whatsappAudioUrls" ? "whatsappAudioUrl" : "whatsappVideoUrl";
        data[legacyField] = urls[0] ?? null;
      }
      if (!Object.keys(data).length) return res.status(400).json({ message: "Aucun contenu à enregistrer." });
      const saved = await storage.updateProduct(id, data);
      if (!saved) return res.status(404).json({ message: "Produit introuvable." });
      res.json(content(saved));
    } catch { res.status(500).json({ message: "Impossible d'enregistrer le contenu WhatsApp." }); }
  });
}
