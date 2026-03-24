-- Backfill display_order for existing doctors that all have 0.
-- Assigns sequential order per user_id, ordered by creation time.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) - 1 AS rn
  FROM doctors
  WHERE display_order = 0
)
UPDATE doctors
SET display_order = ranked.rn
FROM ranked
WHERE doctors.id = ranked.id;
