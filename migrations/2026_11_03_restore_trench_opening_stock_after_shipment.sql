-- Follow-up: a new marron departure arrived while the guarded first recovery deployed.
-- Accept further real departures during this rollout, but reject new manual edits/restocks.
-- Evidence: purge run 6 removed the manual opening balance for store 106.
-- The owner's pre-incident variant counts total 150. Preserve all logged
-- departures (including two deleted orders), the +1 restock and -4/+3 edits.
-- Never infer which variant the two parent-only departures belonged to.
CREATE TABLE IF NOT EXISTS stock_inventory_recovery_backups (
  recovery_key text PRIMARY KEY,
  store_id integer NOT NULL,
  product_id integer NOT NULL,
  before_state jsonb NOT NULL,
  evidence jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

DO $$
DECLARE
  target_product products%ROWTYPE;
  recovered_variant record;
BEGIN
  IF EXISTS (SELECT 1 FROM stock_inventory_recovery_backups
             WHERE recovery_key='2026-11-03-trench-2374') THEN RETURN; END IF;
  SELECT * INTO target_product FROM products WHERE id=2374 AND store_id=106
    AND name='trench ref207' AND sku='207' AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR target_product.stock<>0 THEN RETURN; END IF;
  PERFORM id FROM product_variants WHERE product_id=2374 FOR UPDATE;
  PERFORM id FROM stock_movements WHERE product_id=2374 FOR UPDATE;
  IF (SELECT count(*) FROM product_variants WHERE product_id=2374)<>7
    OR (SELECT count(*) FROM product_variants v JOIN (VALUES
      (2666,'74750033102749'),(2667,'74750058530717'),(2668,'74757321394077'),
      (2669,'74757346822045'),(2670,'74711346002043'),(2671,'69711358002055'),
      (2672,'74750007674781')) expected(id,sku) ON expected.id=v.id AND expected.sku=v.sku
      WHERE v.product_id=2374 AND v.store_id=106 AND v.stock=0)<>7
    OR (SELECT count(*) FROM stock_adjustment_purge_backups
      WHERE product_id=2374 AND store_id=106 AND purge_run_id=6 AND
      ((id=351 AND quantity=150 AND original_movement_id=17595) OR
       (id=359 AND quantity=-4 AND original_movement_id=17604) OR
       (id=360 AND quantity=3 AND original_movement_id=17605)))<>3
    OR (SELECT count(*) FROM stock_movements m JOIN (VALUES
      (17596,-1),(17601,-1),(17602,1),(17759,-1),(17760,-1),
      (17776,-1),(17777,-1),(17857,-1)) expected(id,quantity)
      ON expected.id=m.id AND expected.quantity=m.quantity
      WHERE m.product_id=2374 AND m.store_id=106)<>8
    OR EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id=2374
      AND m.id NOT IN (17596,17601,17602,17759,17760,17776,17777,17857)
      AND NOT (m.store_id=106 AND m.type IN ('shipped','delivered') AND m.quantity<0
        AND m.order_id IS NOT NULL AND m.created_at>='2026-11-03 14:45:00'
        AND (m.variant_id IS NULL OR m.variant_id IN (2666,2667,2668,2669,2670,2671,2672))))
  THEN RETURN; END IF;

  INSERT INTO stock_inventory_recovery_backups(recovery_key,store_id,product_id,before_state,evidence)
  SELECT '2026-11-03-trench-2374',106,2374,
    jsonb_build_object('product',to_jsonb(target_product),
      'variants',(SELECT jsonb_agg(to_jsonb(v)) FROM product_variants v WHERE product_id=2374),
      'movements',(SELECT jsonb_agg(to_jsonb(m)) FROM stock_movements m WHERE product_id=2374)),
    jsonb_build_object('purge_run',6,'backup_ids',ARRAY[351,359,360],
      'owner_evidence','WhatsApp Image 2026-11-03 at 14.39.05; marron 35 confirmed by owner',
      'opening_quantities',jsonb_build_object('noir',2,'bordeau',21,'beige',10,
        'vert',14,'camel',33,'bleu marine',35,'marron',35));

  -- Product editing recreated this variant ID without moving its history.
  UPDATE stock_movements SET variant_id=2672
    WHERE product_id=2374 AND store_id=106 AND id IN (17596,17601) AND variant_id=2617;

  -- Restore the signed recount edits, with their original provenance/date.
  INSERT INTO stock_movements(store_id,product_id,variant_id,type,quantity,reason,user_id,created_at)
    SELECT store_id,product_id,variant_id,type,quantity,reason,user_id,original_created_at
    FROM stock_adjustment_purge_backups WHERE id IN (359,360)
      AND product_id=2374 AND store_id=106 AND purge_run_id=6;

  -- Represent the purged +150 opening as seven physical opening entries,
  -- rather than restoring the aggregate +150 a second time on the parent.
  FOR recovered_variant IN SELECT * FROM (VALUES
    (2666,2),(2667,21),(2668,10),(2669,14),(2670,33),(2671,35),(2672,35)
  ) openings(id,quantity) LOOP
    INSERT INTO stock_movements(store_id,product_id,variant_id,type,quantity,reason,user_id,created_at)
      VALUES(106,2374,recovered_variant.id,'restock',recovered_variant.quantity,
        'Restauration stock initial supprimé — sauvegarde purge #6, quantités validées par propriétaire',
        123,'2026-11-01 20:04:19.847');
    UPDATE product_variants v SET stock=(SELECT COALESCE(sum(m.quantity),0)
      FROM stock_movements m WHERE m.product_id=2374 AND m.store_id=106 AND m.variant_id=v.id)
      WHERE v.id=recovered_variant.id AND v.product_id=2374 AND v.store_id=106;
  END LOOP;
  UPDATE products SET stock=(SELECT COALESCE(sum(quantity),0) FROM stock_movements
    WHERE product_id=2374 AND store_id=106 AND variant_id IS NULL)
    WHERE id=2374 AND store_id=106;
END $$;
