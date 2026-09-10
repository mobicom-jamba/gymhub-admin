-- profiles.role (user_role enum): HR / байгууллагын админ эрх нэмнэ.
-- ALTER TYPE ... ADD VALUE-г тусад нь файлд байлгана: шинэ утгыг ижил
-- транзакцад шууд ашиглаж болдоггүй (add_user_role_sales.sql-тэй ижил дүрэм).
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'org_admin';
