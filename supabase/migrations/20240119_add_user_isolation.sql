-- Add user_id to tables that don't have it yet, for per-user data isolation.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE national_holidays ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE schedule_config ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- doctors already has user_id but it may not be populated; ensure it's NOT NULL going forward
-- (existing rows need to be updated first — see note at bottom)

-- Create indexes for user_id columns
CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams(user_id);
CREATE INDEX IF NOT EXISTS idx_doctors_user_id ON doctors(user_id);
CREATE INDEX IF NOT EXISTS idx_national_holidays_user_id ON national_holidays(user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_config_user_id ON schedule_config(user_id);

-- Enable RLS on all tables (some already have it, this is idempotent)
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE national_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_config ENABLE ROW LEVEL SECURITY;

-- Drop old permissive policies
DROP POLICY IF EXISTS "Allow all operations on schedule_config" ON schedule_config;
DROP POLICY IF EXISTS "Allow all operations on leave_days" ON leave_days;
DROP POLICY IF EXISTS "Allow all operations on national_holidays" ON national_holidays;

-- doctors: owned by user_id
CREATE POLICY "Users can manage own doctors" ON doctors
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- teams: owned by user_id
CREATE POLICY "Users can manage own teams" ON teams
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- shifts: owned via doctor → user_id
CREATE POLICY "Users can manage own shifts" ON shifts
  FOR ALL
  USING (doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid()))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid()));

-- leave_days: owned via doctor → user_id
CREATE POLICY "Users can manage own leave_days" ON leave_days
  FOR ALL
  USING (doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid()))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid()));

-- national_holidays: owned by user_id
CREATE POLICY "Users can manage own national_holidays" ON national_holidays
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- schedule_config: owned by user_id
CREATE POLICY "Users can manage own schedule_config" ON schedule_config
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- NOTE: Before running this migration on an existing database with data,
-- you must update existing rows to set user_id to your current user's ID:
--
--   UPDATE doctors SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;
--   UPDATE teams SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;
--   UPDATE national_holidays SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;
--   UPDATE schedule_config SET user_id = '<your-user-uuid>' WHERE user_id IS NULL;
 