-- Add order column to teams table for team rotation priority
ALTER TABLE teams ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0;

-- Update existing teams with sequential order based on creation date
WITH ordered_teams AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) - 1 as new_order
  FROM teams
)
UPDATE teams
SET "order" = ordered_teams.new_order
FROM ordered_teams
WHERE teams.id = ordered_teams.id;

-- Add index for efficient ordering
CREATE INDEX IF NOT EXISTS idx_teams_order ON teams("order");
