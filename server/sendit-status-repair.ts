// Repair only contradictions evidenced by the last stored Sendit event.
// No tracking, fees, assignments, stock movements or human action dates change.
// One SQL statement makes the correction and audit atomic and idempotent.
export const SENDIT_STATUS_REPAIR_SQL = `
WITH candidates AS (
 SELECT id, status AS previous_status, comment_status AS previous_comment_status,
   CASE
     WHEN upper(trim(split_part(comment_status, ' | ', 1))) IN ('POSTPONED','REPORTÉ','REPORTE')
       AND lower(trim(status)) IN ('confirme','confirme_reporte') THEN 'in_progress'
     WHEN upper(trim(split_part(comment_status, ' | ', 1))) IN
       ('PENDING','EN ATTENTE','TO_PREPARE','À PRÉPARER','NEW_DESTINATION','À CHANGER')
       AND lower(trim(status)) IN ('confirme','pending','to_prepare','new_destination') THEN 'Attente De Ramassage'
     WHEN upper(trim(split_part(comment_status, ' | ', 1))) IN
       ('DISTRIBUTED','DISTRIBUÉ','DELIVERING','EN COURS DE LIVRAISON','TRANSIT','EN TRANSIT')
       AND lower(trim(status)) IN ('delivered','livré','livrée','livre') THEN 'transit'
     WHEN upper(trim(split_part(comment_status, ' | ', 1))) IN
       ('CANCELED','CANCELLED','ANNULÉ','ANNULE','REJECTED','REFUSED','REFUSÉ','REFUSE')
       AND lower(trim(status)) IN ('cancelled','canceled','rejected','annulé','annule','refusé','refuse','delivered','livré','livrée','in_progress','transit','confirme','attente de ramassage') THEN 'refused'
     -- A manual confirmation after the old POSTPONED mapping erased the raw
     -- carrier comment but retained tracking. Recover the postponement from
     -- its latest lifecycle audit rather than making up a new carrier stage.
     WHEN lower(trim(status)) = 'confirme' AND nullif(trim(comment_status),'') IS NULL
       AND (SELECT l.note FROM order_follow_up_logs l WHERE l.order_id=orders.id
         AND l.note LIKE 'Statut: %' ORDER BY l.created_at DESC,l.id DESC LIMIT 1)
         = 'Statut: "confirme_reporte" → "confirme"' THEN 'in_progress'
   END AS corrected_status
 FROM orders
 WHERE lower(trim(coalesce(nullif(shipping_provider,''),carrier_name,''))) = 'sendit'
   AND nullif(trim(track_number),'') IS NOT NULL
), corrected AS (
 UPDATE orders o SET status = c.corrected_status,
   comment_status = CASE WHEN c.corrected_status = 'in_progress' AND c.previous_status = 'confirme'
     AND nullif(trim(c.previous_comment_status),'') IS NULL THEN 'POSTPONED' ELSE o.comment_status END
 FROM candidates c WHERE o.id = c.id AND c.corrected_status IS NOT NULL
   AND o.status = c.previous_status
   AND o.comment_status IS NOT DISTINCT FROM c.previous_comment_status
 RETURNING o.id, c.previous_status, o.status
)
INSERT INTO order_follow_up_logs(order_id,agent_id,agent_name,note,created_at)
 SELECT id,NULL,'Système / Sendit',
   'Correction Sendit : ' || previous_status || ' → ' || status,
   now() AT TIME ZONE 'UTC'
 FROM corrected;
`;
