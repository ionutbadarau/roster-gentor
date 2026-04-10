-- Flag to mark dispatch assignments that were set manually (preserved during auto-assign)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_manual_dispatch BOOLEAN NOT NULL DEFAULT false;
