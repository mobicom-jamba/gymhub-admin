-- Door code for unstaffed gyms (e.g. Global Gym 1/2): members get the code
-- from /api/checkin after a successful QR check-in. Admins rotate it weekly.
-- Kept in its own table so the public gyms reads never expose it.

CREATE TABLE IF NOT EXISTS public.gym_door_codes (
  gym_id uuid PRIMARY KEY REFERENCES public.gyms(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (length(btrim(code)) > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.gym_door_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage gym door codes" ON public.gym_door_codes;
CREATE POLICY "Admins manage gym door codes"
  ON public.gym_door_codes FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.gym_door_codes IS 'Door code shown to members after QR check-in; admin-only, read by /api/checkin via service role';
