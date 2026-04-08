-- Ensure required app roles exist in the DB enum.
-- Run this once in Supabase SQL editor.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'moderator';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'gym_owner';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'sales';
