-- Audited test: a media request was copied into collected_city, then into the
-- confirmed order. The original receipt in ai_logs records "agadir".
-- Keep a narrow rollback record and never overwrite a subsequent manual edit.
CREATE TABLE IF NOT EXISTS ai_order_city_repair_backups (
  repair_key text PRIMARY KEY, order_id integer NOT NULL, store_id integer NOT NULL,
  previous_city text, previous_collected_city text, repaired_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ai_order_city_repair_backups(repair_key,order_id,store_id,previous_city,previous_collected_city)
SELECT 'media-request-city-56152',o.id,o.store_id,o.customer_city,c.collected_city
FROM orders o JOIN ai_conversations c ON c.order_id=o.id AND c.store_id=o.store_id AND c.id=152
WHERE o.id=56152 AND o.store_id=37 AND o.customer_city='Sft liya tswira dyalo'
AND EXISTS(SELECT 1 FROM ai_logs l WHERE l.order_id=o.id AND l.store_id=o.store_id AND l.role='assistant' AND l.message LIKE '%المدينة: agadir%')
ON CONFLICT(repair_key) DO NOTHING;
UPDATE orders SET customer_city='agadir'
WHERE id=56152 AND store_id=37 AND customer_city='Sft liya tswira dyalo'
AND EXISTS(SELECT 1 FROM ai_order_city_repair_backups WHERE repair_key='media-request-city-56152');
UPDATE ai_conversations SET collected_city=NULL
WHERE id=152 AND order_id=56152 AND store_id=37 AND collected_city='Sft liya tswira dyalo'
AND EXISTS(SELECT 1 FROM ai_order_city_repair_backups WHERE repair_key='media-request-city-56152');
INSERT INTO ai_logs(store_id,order_id,role,message)
SELECT 37,56152,'system','Ville restaurée à agadir depuis le reçu initial : une demande de photo avait été enregistrée par erreur comme ville.'
WHERE EXISTS(SELECT 1 FROM ai_order_city_repair_backups WHERE repair_key='media-request-city-56152')
AND NOT EXISTS(SELECT 1 FROM ai_logs WHERE store_id=37 AND order_id=56152 AND role='system' AND message LIKE 'Ville restaurée à agadir depuis le reçu initial%');
