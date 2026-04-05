-- profiles.role (user_role enum): allow sales staff role for admin app + promos.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'sales';
