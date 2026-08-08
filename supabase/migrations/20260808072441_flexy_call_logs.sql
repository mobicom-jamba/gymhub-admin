-- Flexy төлбөр цуглуулах дуудлагын түүх (нэг хүнд олон удаа залгах боломжтой)
CREATE TABLE IF NOT EXISTS public.flexy_call_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_id  uuid NOT NULL REFERENCES public.installment_payments(id) ON DELETE CASCADE,
  plan_id     uuid REFERENCES public.installment_plans(id) ON DELETE SET NULL,
  agent_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note        text NOT NULL DEFAULT '',
  called_at   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flexy_call_logs_payment_called
  ON public.flexy_call_logs (payment_id, called_at DESC);

CREATE INDEX IF NOT EXISTS idx_flexy_call_logs_user_called
  ON public.flexy_call_logs (user_id, called_at DESC);

COMMENT ON TABLE public.flexy_call_logs IS
  'Flexy хуваарьт төлбөрийн дуудлагын лог — payment бүрт олон удаа залгах боломжтой.';

ALTER TABLE public.flexy_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_flexy_call_logs" ON public.flexy_call_logs;
CREATE POLICY "staff_manage_flexy_call_logs" ON public.flexy_call_logs
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
