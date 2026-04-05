-- Овог + нэр тусдаа хадгалах (бүртгэл, админ)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS surname text,
  ADD COLUMN IF NOT EXISTS given_name text;

COMMENT ON COLUMN public.profiles.surname IS 'Овог';
COMMENT ON COLUMN public.profiles.given_name IS 'Нэр';
