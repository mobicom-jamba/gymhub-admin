-- Gym city (user can filter by city; default Ulaanbaatar)
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT 'ulaanbaatar';

COMMENT ON COLUMN public.gyms.city IS 'Gym city key (ulaanbaatar | darkhan).';

-- Optional guardrail: only allow supported values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gyms_city_check'
  ) THEN
    ALTER TABLE public.gyms
      ADD CONSTRAINT gyms_city_check CHECK (city IN ('ulaanbaatar', 'darkhan'));
  END IF;
END $$;

