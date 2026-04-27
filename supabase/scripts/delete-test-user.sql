-- Delete a test user by email from public.users, public.subscriptions, and auth.users.
--
-- Usage (Supabase SQL Editor): replace the value below and run.
-- Run as a Postgres role with access to auth schema (the SQL editor uses the
-- service role, which is fine).
--
-- Note: this does NOT delete the Stripe customer. Remove that from the Stripe
-- dashboard separately, or extend the signup logic to delete via Stripe API.

DO $$
DECLARE
  target_email text := 'REPLACE_WITH_EMAIL@example.com';
  target_id    uuid;
BEGIN
  SELECT id INTO target_id FROM auth.users WHERE email = target_email;

  IF target_id IS NULL THEN
    RAISE NOTICE 'No auth.users row for %', target_email;
  ELSE
    RAISE NOTICE 'Deleting user % (id=%)', target_email, target_id;
  END IF;

  -- public.users has no FK cascade from auth.users, so delete explicitly.
  DELETE FROM public.users WHERE email = target_email OR id = target_id;

  -- subscriptions FK is ON DELETE CASCADE, but delete explicitly for clarity
  -- and to handle any rows orphaned from a prior partial cleanup.
  IF target_id IS NOT NULL THEN
    DELETE FROM public.subscriptions WHERE user_id = target_id;
  END IF;

  -- Finally remove auth row. Cascades to other auth.users-referencing tables.
  IF target_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = target_id;
  END IF;
END $$;
