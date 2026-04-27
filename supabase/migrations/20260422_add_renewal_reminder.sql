-- Track which current_period_end value the renewal reminder email was sent for.
-- Re-arms automatically when the period rolls (value changes after a successful renewal).
ALTER TABLE public.subscriptions
ADD COLUMN renewal_reminder_sent_for_period_end TIMESTAMPTZ;
