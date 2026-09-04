-- GymGo багц: Smart-ийн байнгын залгамжлагч. Тусдаа өөрийн gymgo tier-тэй.
-- 300,000₮, 6 сар, 7 хоногт 3 удаа, зөвхөн QPay (Flexy байхгүй).
-- membership_tier enum-д 'gymgo' утга нэмнэ. Additive, аюулгүй — хуучин утгуудад нөлөөлөхгүй.
-- Хуучин Smart гишүүд хэвээрээ 'standard' tier-тэй үлдэнэ.

alter type public.membership_tier add value if not exists 'gymgo';
