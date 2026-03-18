-- Add display_order column to doctors table for manual sorting
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;
