CREATE TABLE public.visualizacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_nome text,
  licitacao_id uuid REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  fonte_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX visualizacoes_unicas ON public.visualizacoes (equipe_id, user_id, COALESCE(licitacao_id::text, fonte_id));
CREATE INDEX visualizacoes_equipe_fonte ON public.visualizacoes (equipe_id, fonte_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visualizacoes TO authenticated;
GRANT ALL ON public.visualizacoes TO service_role;

ALTER TABLE public.visualizacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY visualizacoes_equipe ON public.visualizacoes FOR ALL TO authenticated
USING (equipe_id = public.current_equipe_id())
WITH CHECK (equipe_id = public.current_equipe_id());

ALTER TABLE public.chat_mensagens ADD COLUMN IF NOT EXISTS papel text NOT NULL DEFAULT 'licitante';