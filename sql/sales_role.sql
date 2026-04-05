-- Sales дүр: промо код, бүртгэлийн холбоос, борлуулалтын шимтгэл (жишээ 5%).
-- Supabase SQL editor дээр нэг удаа ажиллуулна.
--
-- Хэрэв profiles.role дээр CHECK constraint байвал 'sales' утга нэмэх хэрэгтэй:
--   ALTER TABLE profiles DROP CONSTRAINT ...; эсвэл шинэ constraint-д sales оруулна.

-- 1) Хэрэглэгчийг борлуулагчид холбох (промо кодоор)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sales_referred_by uuid REFERENCES public.profiles (id);

CREATE INDEX IF NOT EXISTS idx_profiles_sales_referred_by
  ON public.profiles (sales_referred_by)
  WHERE sales_referred_by IS NOT NULL;

-- 2) Борлуулагчийн промо код (нэг идэвхтэй код / борлуулагч)
CREATE TABLE IF NOT EXISTS public.sales_promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  sales_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  commission_rate numeric(8, 5) NOT NULL DEFAULT 0.05,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_promo_codes_rate_chk CHECK (commission_rate >= 0 AND commission_rate <= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_promo_codes_code_lower_idx
  ON public.sales_promo_codes (lower(trim(code)));

CREATE UNIQUE INDEX IF NOT EXISTS sales_promo_codes_one_active_per_sales_idx
  ON public.sales_promo_codes (sales_user_id)
  WHERE is_active = true;

-- 3) Төлбөр бүрийн комиссын бүртгэл (давхардахаас сэргийлнэ)
CREATE TABLE IF NOT EXISTS public.sales_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  buyer_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  booking_id text NOT NULL,
  gross_amount numeric(14, 2) NOT NULL,
  commission_rate numeric(8, 5) NOT NULL,
  commission_amount numeric(14, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_commissions_booking_unique UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_commissions_sales_user
  ON public.sales_commissions (sales_user_id, created_at DESC);

COMMENT ON TABLE public.sales_promo_codes IS 'Борлуулагчийн промо код; бүртгэлд sales_referred_by тохируулна.';
COMMENT ON TABLE public.sales_commissions IS 'Гишүүнчлэлийн төлбөр төлөгдсөний дараах комисс.';
