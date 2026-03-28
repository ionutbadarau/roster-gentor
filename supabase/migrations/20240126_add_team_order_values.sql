-- Drop the old constraint that enforces order unique across ALL users
ALTER TABLE teams DROP CONSTRAINT teams_order_key;

-- Add a composite unique constraint: order is unique per user
ALTER TABLE teams ADD CONSTRAINT teams_order_user_unique UNIQUE (user_id, "order");

-- Now backfill order values
UPDATE teams
SET "order" = sub.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS rn
  FROM teams
) sub
WHERE teams.id = sub.id;
