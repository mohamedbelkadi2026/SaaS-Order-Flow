-- Physical return confirmation fields
-- Stock is no longer restored automatically on status change to "retourné".
-- It is only restored after explicit manual confirmation (scan / tracking number).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_confirmed_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_confirmed_by INTEGER REFERENCES users(id);
