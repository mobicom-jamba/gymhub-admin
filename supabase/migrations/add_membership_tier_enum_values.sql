-- New plan slugs used by admin + payment flows
ALTER TYPE public.membership_tier ADD VALUE IF NOT EXISTS 'standard';
ALTER TYPE public.membership_tier ADD VALUE IF NOT EXISTS 'premium1';
ALTER TYPE public.membership_tier ADD VALUE IF NOT EXISTS 'premium2';
ALTER TYPE public.membership_tier ADD VALUE IF NOT EXISTS 'gymcore';
-- Booking / legacy aliases
ALTER TYPE public.membership_tier ADD VALUE IF NOT EXISTS 'smart1';
ALTER TYPE public.membership_tier ADD VALUE IF NOT EXISTS 'smart2';
ALTER TYPE public.membership_tier ADD VALUE IF NOT EXISTS 'premium4';
ALTER TYPE public.membership_tier ADD VALUE IF NOT EXISTS 'standard3';
ALTER TYPE public.membership_tier ADD VALUE IF NOT EXISTS 'early_year';
ALTER TYPE public.membership_tier ADD VALUE IF NOT EXISTS 'early_month';
