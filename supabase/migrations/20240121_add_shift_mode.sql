-- Add shift_mode column to doctors table (default '12h')
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS shift_mode TEXT NOT NULL DEFAULT '12h';

-- Allow '24h' shift_type in shifts table
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_shift_type_check;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_shift_type_check CHECK (shift_type IN ('day', 'night', 'rest', '24h'));
