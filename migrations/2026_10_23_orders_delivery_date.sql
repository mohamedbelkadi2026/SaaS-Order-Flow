-- Independent delivery timestamp: never substitute created_at, pickup_date or updated_at.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE OR REPLACE FUNCTION dashboard_is_delivered_status(value text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(translate(trim(coalesce(value, '')), 'éèêëÉÈÊË', 'eeeeEEEE'))
    IN ('delivered', 'livre', 'livree', 'livre au client', 'livree au client');
$$;

-- Only explicit lifecycle transitions are reliable historical evidence.
-- MAX selects the most recent delivery after any cancellation/re-delivery.
-- Alias changes between delivered statuses do not establish a new delivery.
WITH transitions AS (
  SELECT l.order_id, max(l.created_at) AT TIME ZONE 'UTC' AS delivered_at
  FROM order_follow_up_logs l
  JOIN orders o ON o.id = l.order_id
  CROSS JOIN LATERAL regexp_match(l.note, '^Statut: "([^"]*)" → "([^"]*)"$') AS matched(parts)
  WHERE o.delivered_at IS NULL
    AND dashboard_is_delivered_status(o.status)
    AND dashboard_is_delivered_status(matched.parts[2])
    AND NOT dashboard_is_delivered_status(matched.parts[1])
  GROUP BY l.order_id
)
UPDATE orders o SET delivered_at = transitions.delivered_at
FROM transitions
WHERE o.id = transitions.order_id AND o.delivered_at IS NULL;

CREATE OR REPLACE FUNCTION record_order_delivery_date()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF dashboard_is_delivered_status(NEW.status) THEN
    IF TG_OP = 'INSERT' THEN
      -- Imports/restored snapshots can already be delivered. Their insert
      -- time is not evidence of the actual delivery; preserve only an explicit date.
      RETURN NEW;
    ELSIF dashboard_is_delivered_status(OLD.status) THEN
      -- Repeated carrier syncs, invoicing aliases and unrelated edits must
      -- not move an already recorded delivery to today's statistics.
      NEW.delivered_at := OLD.delivered_at;
    ELSE
      NEW.delivered_at := coalesce(NEW.delivered_at, now());
    END IF;
  ELSE
    NEW.delivered_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_record_delivery_date ON orders;
CREATE TRIGGER orders_record_delivery_date
BEFORE INSERT OR UPDATE OF status, delivered_at ON orders
FOR EACH ROW EXECUTE FUNCTION record_order_delivery_date();

CREATE INDEX IF NOT EXISTS orders_store_delivered_at_idx
  ON orders (store_id, delivered_at) WHERE delivered_at IS NOT NULL;
