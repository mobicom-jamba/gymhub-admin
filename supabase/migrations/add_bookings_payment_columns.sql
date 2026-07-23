-- Membership payments use text booking ids (e.g. membership-smart1-<ts>).
-- Admin analytics / payment APIs expect payment_* columns on public.bookings.

-- Class bookings stay valid; schedule_id is only required for class bookings.
ALTER TABLE public.bookings
  ALTER COLUMN schedule_id DROP NOT NULL;

ALTER TABLE public.bookings
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE public.bookings
  ALTER COLUMN id TYPE text USING id::text;

ALTER TABLE public.bookings
  ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS amount numeric,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS payment_channel text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS qpay_invoice_id text;

COMMENT ON COLUMN public.bookings.amount IS 'Membership / payment amount (MNT).';
COMMENT ON COLUMN public.bookings.payment_status IS 'pending | paid | failed | cancelled, etc.';
COMMENT ON COLUMN public.bookings.payment_channel IS 'qpay | sono | pocket | carepay | monpay | gift | gymfintech';
COMMENT ON COLUMN public.bookings.paid_at IS 'When payment was confirmed.';
COMMENT ON COLUMN public.bookings.qpay_invoice_id IS 'External invoice id (QPay / Sono / Carepay / Monpay / Pocket).';

CREATE INDEX IF NOT EXISTS idx_bookings_payment_status
  ON public.bookings (payment_status);

CREATE INDEX IF NOT EXISTS idx_bookings_paid_at
  ON public.bookings (paid_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_bookings_qpay_invoice_id
  ON public.bookings (qpay_invoice_id)
  WHERE qpay_invoice_id IS NOT NULL;

-- Booking RPCs used uuid booking ids; switch to text to match the column.
DROP FUNCTION IF EXISTS public.cancel_booking(uuid);
DROP FUNCTION IF EXISTS public.mark_attended(uuid);

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id text)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.user_id <> v_user_id then
    raise exception 'Forbidden';
  end if;

  update public.bookings
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_booking_id
  returning * into v_booking;

  perform public.log_activity(
    v_user_id,
    'booking_cancelled',
    jsonb_build_object('booking_id', v_booking.id, 'schedule_id', v_booking.schedule_id)
  );

  return v_booking;
end;
$$;

CREATE OR REPLACE FUNCTION public.mark_attended(p_booking_id text)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.user_id <> v_user_id then
    raise exception 'Forbidden';
  end if;

  update public.bookings
  set status = 'attended',
      checked_in_at = now()
  where id = p_booking_id
  returning * into v_booking;

  perform public.log_activity(
    v_user_id,
    'check_in',
    jsonb_build_object('booking_id', v_booking.id, 'schedule_id', v_booking.schedule_id)
  );

  return v_booking;
end;
$$;

-- Backfill paid membership rows from activations (best-effort amounts).
INSERT INTO public.bookings (
  id,
  user_id,
  schedule_id,
  status,
  payment_status,
  paid_at,
  amount,
  created_at
)
SELECT
  ma.booking_id,
  ma.user_id,
  NULL,
  'booked'::booking_status,
  'paid',
  ma.applied_at,
  COALESCE(sc.gross_amount, ip.total_amount, NULL),
  ma.applied_at
FROM public.membership_activations ma
LEFT JOIN public.sales_commissions sc ON sc.booking_id = ma.booking_id
LEFT JOIN public.installment_plans ip ON ip.booking_id = ma.booking_id
ON CONFLICT (id) DO NOTHING;
