-- 1. Add status column to gym_visits
ALTER TABLE gym_visits
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected'));

-- 2. Add reviewed_at and reviewed_by columns
ALTER TABLE gym_visits
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id);

-- 3. Add role column to profiles (user / gym_owner / admin)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'gym_owner', 'admin'));

-- 4. Create gym_staff table (gym owner <-> gym link)
CREATE TABLE IF NOT EXISTS gym_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, gym_id)
);

-- 5. Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_gym_visits_status ON gym_visits(status, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_gym_visits_gym_status ON gym_visits(gym_id, status);
CREATE INDEX IF NOT EXISTS idx_gym_staff_user ON gym_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_gym_staff_gym ON gym_staff(gym_id);

-- 6. Set existing visits to 'approved' (they were already processed)
UPDATE gym_visits SET status = 'approved' WHERE status = 'pending';
