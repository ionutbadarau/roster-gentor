ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS use_small_shift_letters BOOLEAN NOT NULL DEFAULT false;
