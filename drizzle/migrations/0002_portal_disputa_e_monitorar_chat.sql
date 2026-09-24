ALTER TABLE public.licitacoes
  ADD COLUMN IF NOT EXISTS portal_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chat_config_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chat_status text,
  ADD COLUMN IF NOT EXISTS chat_status_motivo text;

-- Quem já configurou o chat à mão não pode ter a escolha sobrescrita pela detecção automática.
UPDATE public.licitacoes SET chat_config_manual = true
  WHERE chat_config_manual = false AND (chat_monitorar OR chat_conector IS NOT NULL OR chat_id_externo IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.chat_leituras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  licitacao_id uuid NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  lida_ate timestamptz,
  importante boolean NOT NULL DEFAULT false,
  arquivada boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, licitacao_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_leituras TO authenticated;
GRANT ALL ON public.chat_leituras TO service_role;
ALTER TABLE public.chat_leituras ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_leituras_proprio ON public.chat_leituras
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND equipe_id = public.current_equipe_id())
  WITH CHECK (user_id = auth.uid() AND equipe_id = public.current_equipe_id());