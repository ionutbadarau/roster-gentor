-- Doctor eligibility flag for dispatch duty
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS can_dispatch BOOLEAN NOT NULL DEFAULT false;

-- Dispatch assignment on shifts: which dispatch slot this shift covers (null = no dispatch)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS dispatch_type TEXT DEFAULT NULL;
ALTER TABLE shifts ADD CONSTRAINT shifts_dispatch_type_check CHECK (dispatch_type IN ('day', 'night') OR dispatch_type IS NULL);
