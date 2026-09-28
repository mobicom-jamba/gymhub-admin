-- Admin-controlled "full" switch: when on, the gym is reported as full
-- (today_visitors = daily_visitor_limit) and /api/checkin rejects new check-ins.

ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS force_full boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN gyms.force_full IS 'Admin toggle: show gym as full today and block check-ins';
