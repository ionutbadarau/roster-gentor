-- Schedule share tokens: per-doctor, per-month tokens for read-only schedule access.

CREATE TABLE IF NOT EXISTS public.schedule_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  month INTEGER NOT NULL CHECK (month >= 0 AND month <= 11),
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  UNIQUE(user_id, doctor_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON public.schedule_share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_share_tokens_user_month ON public.schedule_share_tokens(user_id, month, year);

ALTER TABLE public.schedule_share_tokens ENABLE ROW LEVEL SECURITY;

-- Admin can manage their own tokens
CREATE POLICY "Users can manage own share tokens" ON public.schedule_share_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Public read by token (token itself is the secret)
CREATE POLICY "Anyone can read by token" ON public.schedule_share_tokens
  FOR SELECT USING (true);

-- SECURITY DEFINER function: validates token, returns schedule data.
-- Bypasses RLS safely because it checks the token first.
CREATE OR REPLACE FUNCTION public.get_schedule_by_token(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok schedule_share_tokens%ROWTYPE;
  v_start DATE;
  v_end DATE;
  v_result JSON;
BEGIN
  SELECT * INTO v_tok
  FROM schedule_share_tokens
  WHERE token = p_token AND expires_at > now();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- month is 0-indexed (JS convention), make_date needs 1-indexed
  v_start := make_date(v_tok.year, v_tok.month + 1, 1);
  v_end   := (v_start + interval '1 month')::date - 1;

  SELECT json_build_object(
    'token', json_build_object(
      'doctor_id', v_tok.doctor_id,
      'month', v_tok.month,
      'year', v_tok.year,
      'user_id', v_tok.user_id
    ),
    'doctors', COALESCE((SELECT json_agg(d ORDER BY d.display_order) FROM doctors d WHERE d.user_id = v_tok.user_id), '[]'::json),
    'teams', COALESCE((SELECT json_agg(t) FROM teams t WHERE t.user_id = v_tok.user_id), '[]'::json),
    'shifts', COALESCE((SELECT json_agg(s) FROM shifts s
      JOIN doctors doc ON s.doctor_id = doc.id
      WHERE doc.user_id = v_tok.user_id
        AND s.shift_date >= v_start
        AND s.shift_date <= v_end
    ), '[]'::json),
    'leave_days', COALESCE((SELECT json_agg(l) FROM leave_days l
      JOIN doctors doc ON l.doctor_id = doc.id
      WHERE doc.user_id = v_tok.user_id
        AND l.leave_date >= v_start
        AND l.leave_date <= v_end
    ), '[]'::json),
    'national_holidays', COALESCE((SELECT json_agg(h) FROM national_holidays h
      WHERE h.user_id = v_tok.user_id
        AND h.holiday_date >= v_start
        AND h.holiday_date <= v_end
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
