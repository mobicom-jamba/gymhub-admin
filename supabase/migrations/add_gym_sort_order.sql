-- Display order for fitness list in app (admin-controlled)
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 9999;

COMMENT ON COLUMN public.gyms.sort_order IS
  'Lower = earlier in app fitness list. Admin-editable.';

CREATE INDEX IF NOT EXISTS idx_gyms_sort_order ON public.gyms (sort_order, name);

-- Preserve prior alphabetical order as starting ranks (idempotent-ish for fresh add)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn
  FROM public.gyms
  WHERE sort_order = 0 OR sort_order = 9999
)
UPDATE public.gyms g
SET sort_order = ranked.rn
FROM ranked
WHERE g.id = ranked.id;
