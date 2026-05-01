-- ============================================================================
-- 0003_add_scheduled_for
-- Adds scheduled_for date column for the "Confirmé Reporté" status flow.
-- Orders with status='confirme_reporte' AND scheduled_for <= CURRENT_DATE
-- will be auto-promoted to status='confirme' by the daily 06:00 Casablanca cron.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS scheduled_for date;

CREATE INDEX IF NOT EXISTS idx_orders_scheduled_for
  ON public.orders (scheduled_for)
  WHERE scheduled_for IS NOT NULL AND status = 'confirme_reporte';
