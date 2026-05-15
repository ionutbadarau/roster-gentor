ALTER TABLE public.shifts
ADD COLUMN IF NOT EXISTS is_small_letter BOOLEAN;
