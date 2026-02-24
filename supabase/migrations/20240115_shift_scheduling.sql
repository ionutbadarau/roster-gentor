CREATE TABLE IF NOT EXISTS public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  team_id UUID,
  is_floating BOOLEAN DEFAULT false,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  max_members INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('day', 'night', 'rest')),
  start_time TIME,
  end_time TIME,
  is_manual BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(doctor_id, shift_date)
);

CREATE TABLE IF NOT EXISTS public.schedule_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_doctors INTEGER NOT NULL DEFAULT 12,
  config_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS and create policies
ALTER TABLE public.schedule_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on schedule_config" ON public.schedule_config
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.doctors ADD CONSTRAINT fk_team FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_doctors_team ON public.doctors(team_id);
CREATE INDEX IF NOT EXISTS idx_shifts_doctor ON public.shifts(doctor_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON public.shifts(shift_date);
