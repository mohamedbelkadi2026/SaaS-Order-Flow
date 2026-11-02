-- Normalize only known Express Relais parcel stages already stored on orders.
-- This is a classification correction, not a new delivery event. Preserve the
-- original delivered_at, action dates, stock, tracking and fees. The runner's
-- transaction/table lock prevents concurrent writes while the date trigger is
-- suspended, and rolls everything back (including trigger state) on failure.
ALTER TABLE orders DISABLE TRIGGER orders_record_delivery_date;
WITH classified AS (
 SELECT id, status AS previous_status, comment_status AS previous_raw,
   coalesce(nullif(trim(comment_status),''),status) AS raw,
   CASE upper(trim(split_part(coalesce(nullif(trim(comment_status),''),status),' | ',1)))
     WHEN 'DELIVRED_TO_ADDRESS' THEN 'delivered'
     WHEN 'DELIVERED_TO_ADDRESS' THEN 'delivered'
     WHEN 'PARCEL_REFUSED' THEN 'refused'
     WHEN 'PARCEL_IN_DELIVERY' THEN 'Mis en distribution'
     WHEN 'RESCHEDULED_DELIVERY_BY_RECIPIENT' THEN 'in_progress'
     WHEN 'SCHEDULED_DELIVERY' THEN 'in_progress'
     WHEN 'UNREACHABLE_RECIPIENT' THEN 'unreachable'
     WHEN 'PICKUP_ASSIGNED' THEN 'Attente De Ramassage'
     WHEN 'WRONG_ADDRESS' THEN 'in_progress'
     WHEN 'PARCEL_IN_RETURN_AGENCY' THEN 'RETOUR READY'
   END AS next_status
 FROM orders
 WHERE lower(regexp_replace(coalesce(nullif(trim(shipping_provider),''),carrier_name,''),'[^a-zA-Z]','','g'))='expressrelais'
   AND nullif(trim(track_number),'') IS NOT NULL
   AND lower(trim(status)) NOT IN ('delivered','livré','livrée','livre','returned','retourné','retournée','retour recu','retour reçu')
   AND (lower(trim(status)) NOT IN ('refused','refusé','refuse') OR
     upper(trim(split_part(coalesce(nullif(trim(comment_status),''),status),' | ',1))) IN ('PARCEL_REFUSED','PARCEL_IN_RETURN_AGENCY'))
), corrected AS (
 UPDATE orders o SET status=c.next_status, comment_status=c.raw
 FROM classified c WHERE o.id=c.id AND c.next_status IS NOT NULL AND o.status<>c.next_status
   AND o.status=c.previous_status AND o.comment_status IS NOT DISTINCT FROM c.previous_raw
 RETURNING o.id,c.previous_status,o.status,c.raw
)
INSERT INTO order_follow_up_logs(order_id,agent_id,agent_name,note,created_at)
 SELECT id,NULL,'Système / Express Relais',
   'Correction classement Express Relais : '||previous_status||' → '||status||' ('||raw||')',now() AT TIME ZONE 'UTC'
 FROM corrected;
ALTER TABLE orders ENABLE TRIGGER orders_record_delivery_date;
