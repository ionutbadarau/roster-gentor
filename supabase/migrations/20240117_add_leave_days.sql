-- Create leave_days table for tracking doctor vacation/leave days
CREATE TABLE IF NOT EXISTS leave_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  leave_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(doctor_id, leave_date)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leave_days_doctor_id ON leave_days(doctor_id);
CREATE INDEX IF NOT EXISTS idx_leave_days_leave_date ON leave_days(leave_date);

-- Enable RLS
ALTER TABLE leave_days ENABLE ROW LEVEL SECURITY;

-- Create policies for leave_days
CREATE POLICY "Allow all operations on leave_days" ON leave_days
  FOR ALL
  USING (true)
  WITH CHECK (true);
