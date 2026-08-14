-- Phase 3 TajerDrop Seller flow
-- tajerdrop_status: NULL for standard stores | 'pending' | 'validated' | 'rejected' for TajerDrop sellers
-- tajerdrop_experience: optional seller experience text/level
-- tajerdrop_city: seller's declared city at registration

ALTER TABLE stores ADD COLUMN IF NOT EXISTS tajerdrop_status text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS tajerdrop_experience text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS tajerdrop_city text;
