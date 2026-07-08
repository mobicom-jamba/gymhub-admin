-- Борлуулалтын ажилтанууд хэрэглэгч бүрт тэмдэглэл болон залгасан эсэхийг хадгалах
CREATE TABLE IF NOT EXISTS public.user_sales_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  called      boolean NOT NULL DEFAULT false,
  called_at   timestamptz,
  note        text NOT NULL DEFAULT '',
  agent_id    uuid REFERENCES public.profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_sales_notes ENABLE ROW LEVEL SECURITY;

-- Зөвхөн admin, moderator, sales эрхтэй хэрэглэгчид унших/бичих боломжтой
CREATE POLICY "staff_manage_sales_notes" ON public.user_sales_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'moderator', 'sales')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'moderator', 'sales')
    )
  );
