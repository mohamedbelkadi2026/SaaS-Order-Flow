-- Team lead flag: an agent who supervises the team matching their roleInStore.
-- Visibility over their team's orders only; not admin rights over the store.
ALTER TABLE store_agent_settings
  ADD COLUMN IF NOT EXISTS is_team_lead INTEGER NOT NULL DEFAULT 0;
