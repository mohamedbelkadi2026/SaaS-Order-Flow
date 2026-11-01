-- Verified missed shipment: the imported item had a unique variant SKU but no
-- product link. Strict identity/quantity/stock guards prevent a broad backfill.
-- All writes are atomic inside the migration runner's transaction and retry-safe.
WITH target AS (
 SELECT o.id AS order_id, i.id AS item_id, p.id AS product_id,
        v.id AS variant_id, v.stock AS previous_stock, i.quantity, o.store_id
 FROM orders o
 JOIN order_items i ON i.order_id=o.id
 JOIN products p ON p.id=2374 AND p.store_id=o.store_id AND p.archived_at IS NULL
 JOIN product_variants v ON v.id=2617 AND v.product_id=p.id
 WHERE o.id=54963 AND o.store_id=106 AND o.order_number='12793'
   AND o.track_number='STT1793563752575'
   AND o.status='Attente De Ramassage'
   AND i.id=53330 AND (i.product_id IS NULL OR i.product_id=p.id)
   AND trim(i.sku)='74750007674781' AND trim(v.sku)=trim(i.sku)
   AND i.quantity=1 AND v.stock=35
   AND (SELECT count(*) FROM product_variants same_sku JOIN products owner ON owner.id=same_sku.product_id
        WHERE owner.store_id=o.store_id AND owner.archived_at IS NULL AND trim(same_sku.sku)=trim(i.sku))=1
   AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.order_id=o.id AND m.type IN ('shipped','delivered'))
   AND NOT EXISTS (SELECT 1 FROM stock_logs l WHERE l.order_id=o.id AND l.change_amount<0)
 FOR UPDATE OF o,i,v
), linked AS (
 UPDATE order_items i SET product_id=t.product_id
 FROM target t WHERE i.id=t.item_id
 RETURNING i.id
), deducted AS (
 UPDATE product_variants v SET stock=t.previous_stock-t.quantity
 FROM target t JOIN linked l ON l.id=t.item_id WHERE v.id=t.variant_id
 RETURNING v.id
), movement AS (
 INSERT INTO stock_movements(store_id,product_id,variant_id,type,quantity,order_id,reason)
 SELECT t.store_id,t.product_id,t.variant_id,'shipped',-t.quantity,t.order_id,
   'Correction sortie manquante : liaison SKU variante, commande #12793'
 FROM target t JOIN deducted d ON d.id=t.variant_id
 RETURNING order_id
)
INSERT INTO stock_logs(store_id,product_id,order_id,change_amount,reason)
 SELECT t.store_id,t.product_id,t.order_id,-t.quantity,
   'Correction sortie manquante : variante marron, commande #12793 (35 → 34)'
 FROM target t JOIN movement m ON m.order_id=t.order_id;
