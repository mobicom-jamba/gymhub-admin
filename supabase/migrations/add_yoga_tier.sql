-- Йога багц: зөвхөн йога төвүүдэд (gyms.type = 'yoga') check-in хийх эрх.
-- membership_tier enum-д 'yoga' утга нэмнэ. Additive, аюулгүй — хуучин утгуудад нөлөөлөхгүй.

alter type public.membership_tier add value if not exists 'yoga';
