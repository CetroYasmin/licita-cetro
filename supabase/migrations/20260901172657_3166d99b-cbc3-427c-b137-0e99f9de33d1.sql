CREATE TABLE public.captura_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Captura de chat',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  ativo boolean NOT NULL DEFAULT true,
  ultimo_uso_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.captura_tokens TO authenticated;
GRANT ALL ON public.captura_tokens TO service_role;
ALTER TABLE public.captura_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY captura_tokens_select ON public.captura_tokens
  FOR SELECT TO authenticated USING (equipe_id = current_equipe_id());
CREATE POLICY captura_tokens_admin ON public.captura_tokens
  FOR ALL TO authenticated
  USING (equipe_id = current_equipe_id() AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (equipe_id = current_equipe_id() AND has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.chat_mensagens
  ADD COLUMN IF NOT EXISTS referencia_externa text,
  ADD COLUMN IF NOT EXISTS externo_id text;

CREATE UNIQUE INDEX IF NOT EXISTS chat_mensagens_externo_uniq
  ON public.chat_mensagens (licitacao_id, externo_id) WHERE externo_id IS NOT NULL;

ALTER TABLE public.chat_mensagens REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensagens;