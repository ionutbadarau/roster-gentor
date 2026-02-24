CREATE TABLE IF NOT EXISTS national_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_national_holidays_date ON national_holidays(holiday_date);

-- Enable RLS
ALTER TABLE national_holidays ENABLE ROW LEVEL SECURITY;

-- Create policies for national_holidays
CREATE POLICY "Allow all operations on national_holidays" ON national_holidays
  FOR ALL
  USING (true)
  WITH CHECK (true);
