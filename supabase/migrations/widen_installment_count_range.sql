-- GymFinTech: хуваарийн тоог 2-4-өөс 2-8 болгож өргөтгөв.
alter table public.installment_plans
  drop constraint if exists installment_plans_count_chk;

alter table public.installment_plans
  add constraint installment_plans_count_chk check (installment_count between 2 and 8);
