-- "Coming soon" countdown: while opens_at is in the future the gym is shown as
-- "Гэрээ хийгдэж байна · Тун удахгүй" with a countdown, and /api/checkin rejects
-- check-ins. Once opens_at passes the gym behaves as a normal active gym.

ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS opens_at timestamptz NULL;

COMMENT ON COLUMN gyms.opens_at IS 'When the gym opens for check-ins; future = coming soon countdown, null = already open';
