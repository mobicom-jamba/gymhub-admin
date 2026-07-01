-- Гишүүнчлэл идэвхжүүлэлтийг booking тус бүрт нэг л удаа хийхэд ашиглана (idempotency).
-- Төлбөрийн статусыг олон удаа шалгах үед хугацаа давхарлан нэмэгдэхээс сэргийлнэ.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS membership_applied_at timestamptz;

COMMENT ON COLUMN public.bookings.membership_applied_at IS 'Гишүүнчлэл идэвхжсэн цаг — давхар идэвхжүүлэлтээс сэргийлнэ (idempotency).';
