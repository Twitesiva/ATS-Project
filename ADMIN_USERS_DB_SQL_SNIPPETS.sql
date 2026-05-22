-- =============================
-- Admin Users: uniqueness + duplicate cleanup
-- =============================

-- 1) Add UNIQUE constraints to prevent duplicate profile rows
--    IMPORTANT:
--    - Prefer auth_id uniqueness (1 profile row per auth user)
--    - Also enforce email uniqueness if you want 1 profile row per email
--    - Run cleanup (step 2) before adding constraints if duplicates already exist

ALTER TABLE public.users
ADD CONSTRAINT users_auth_id_unique UNIQUE (auth_id);

-- If you already attempted the constraint before, you may need to drop it first.
-- ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_auth_id_unique;
-- ALTER TABLE public.users ADD CONSTRAINT users_auth_id_unique UNIQUE (auth_id);

-- Optional (recommended): enforce unique email too
ALTER TABLE public.users
ADD CONSTRAINT users_email_unique UNIQUE (email);

-- If you already attempted the constraint before, you may need to drop it first.
-- ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_unique;
-- ALTER TABLE public.users ADD CONSTRAINT users_email_unique UNIQUE (email);


-- 2) Cleanup existing duplicates:
--    Keep the row that has a non-null and non-empty phone_number (or otherwise keep the newest row).
--    Removes the rest.
--
--    Assumes duplicates are the same (case-sensitive) email values.
--    If you store mixed-case emails, consider normalizing emails first.
WITH ranked AS (
  SELECT
    id,
    auth_id,
    email,
    phone_number,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(auth_id::text, email)
      ORDER BY
        CASE
          WHEN phone_number IS NOT NULL AND btrim(phone_number) <> '' THEN 0
          ELSE 1
        END,
        created_at DESC,
        id DESC
    ) AS rn
  FROM public.users
  WHERE email IS NOT NULL
)
DELETE FROM public.users u
USING ranked r
WHERE u.id = r.id
  AND r.rn > 1;


-- 3) (Optional) Normalize email casing to reduce future duplicates.
--    Uncomment if you want to enforce lower-case emails.
--    UPDATE public.users SET email = lower(email) WHERE email IS NOT NULL;

-- 4) If you have an auth->profile trigger, make it idempotent.
--    Typical Supabase setup uses a trigger on auth.users inserts that writes into public.users.
--    Ensure it uses UPSERT with ON CONFLICT (auth_id) DO UPDATE instead of plain INSERT.
--
-- Example (adapt table/columns to your schema):
--
-- CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- AS $$
-- BEGIN
--   INSERT INTO public.users (auth_id, email, role, name)
--   VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'role', 'recruiter'), NEW.raw_user_meta_data->>'name')
--   ON CONFLICT (auth_id) DO UPDATE
--     SET email = EXCLUDED.email,
--         -- Never overwrite an explicit role with a default recruiter role
--         role  = COALESCE(EXCLUDED.role, public.users.role),
--         name  = COALESCE(EXCLUDED.name, public.users.name);
--   RETURN NEW;
-- END;
-- $$;
--
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created
-- AFTER INSERT ON auth.users
-- FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

