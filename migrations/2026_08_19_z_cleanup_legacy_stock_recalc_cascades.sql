-- Repair legacy stock-recalculation cascades across every standard product.
-- Only generated recalculation markers are removed. Physical movements and
-- every manual adjustment are preserved because their intent cannot be safely
-- inferred from a timestamp alone.

WITH legacy_recalcs AS (
  SELECT
    product_id,
    store_id,
    COUNT(*)::integer AS legacy_count,
    MIN(created_at) AS first_legacy_recalc_at
  FROM stock_movements
  WHERE type = 'adjustment'
    AND LOWER(TRIM(COALESCE(reason, ''))) LIKE 'recalcul disponible%'
  GROUP BY product_id, store_id
),
trusted_totals AS (
  SELECT
    p.id AS product_id,
    p.store_id,
    p.stock AS current_stock,
    COALESCE(SUM(
      CASE
        -- Old recalculations and a final audit correction are bookkeeping
        -- markers, not physical inventory movements.
        WHEN sm.type = 'adjustment'
          AND LOWER(TRIM(COALESCE(sm.reason, ''))) LIKE 'recalcul disponible%'
          THEN 0
        WHEN sm.type = 'adjustment'
          AND LOWER(TRIM(COALESCE(sm.reason, ''))) LIKE 'correction historique — recalcul%'
          THEN 0
        ELSE sm.quantity
      END
    ), 0)::integer AS computed_stock
  FROM products p
  LEFT JOIN stock_movements sm
    ON sm.product_id = p.id
   AND sm.store_id = p.store_id
  LEFT JOIN legacy_recalcs lr
    ON lr.product_id = p.id
   AND lr.store_id = p.store_id
  WHERE NOT EXISTS (
    SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id
  )
  GROUP BY p.id, p.store_id, p.stock, lr.legacy_count, lr.first_legacy_recalc_at
),
stock_updates AS (
  UPDATE products p
  SET stock = t.computed_stock
  FROM trusted_totals t
  WHERE p.id = t.product_id
    AND p.store_id = t.store_id
    AND p.stock <> t.computed_stock
  RETURNING
    p.id AS product_id,
    p.store_id,
    (SELECT current_stock FROM trusted_totals WHERE product_id = p.id) AS previous_stock,
    p.stock AS corrected_stock
),
removed_cascades AS (
  DELETE FROM stock_movements sm
  USING legacy_recalcs lr
  WHERE sm.product_id = lr.product_id
    AND sm.store_id = lr.store_id
    AND sm.type = 'adjustment'
    AND (
      LOWER(TRIM(COALESCE(sm.reason, ''))) LIKE 'recalcul disponible%'
      OR LOWER(TRIM(COALESCE(sm.reason, ''))) LIKE 'correction historique — recalcul%'
    )
  RETURNING sm.id
)
INSERT INTO stock_movements (store_id, product_id, type, quantity, reason)
SELECT
  store_id,
  product_id,
  'adjustment',
  corrected_stock - previous_stock,
  'Correction historique — recalcul basé sur le grand livre'
FROM stock_updates;