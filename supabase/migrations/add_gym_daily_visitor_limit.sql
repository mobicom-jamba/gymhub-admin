-- Per-gym cap on how many users can check in per calendar day (Mongolia UTC+8), enforced in /api/checkin.
-- NULL = no limit.

ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS daily_visitor_limit integer;

ALTER TABLE gyms
  DROP CONSTRAINT IF EXISTS gyms_daily_visitor_limit_positive;

ALTER TABLE gyms
  ADD CONSTRAINT gyms_daily_visitor_limit_positive
  CHECK (daily_visitor_limit IS NULL OR daily_visitor_limit > 0);

COMMENT ON COLUMN gyms.daily_visitor_limit IS 'Max pending+approved gym_visits per local day; NULL = unlimited';
