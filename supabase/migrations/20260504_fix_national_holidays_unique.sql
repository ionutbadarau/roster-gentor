-- Fix unique constraint on national_holidays: was global on holiday_date,
-- but the table is per-user (user_id added in 20240119_add_user_isolation).
-- Replace with a composite unique constraint on (user_id, holiday_date) so
-- different users can independently mark the same date as a holiday.

ALTER TABLE national_holidays DROP CONSTRAINT IF EXISTS national_holidays_holiday_date_key;

ALTER TABLE national_holidays
  ADD CONSTRAINT national_holidays_user_id_holiday_date_key
  UNIQUE (user_id, holiday_date);
