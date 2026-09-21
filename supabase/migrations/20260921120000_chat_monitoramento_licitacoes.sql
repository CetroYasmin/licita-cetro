-- Monitoramento automático do chat direto na licitação.
-- Reaproveita chat_mensagens (mensagens) e alertas (avisos + sino), que a interface já usa.

ALTER TABLE public.licitacoes
  ADD COLUMN IF NOT EXISTS chat_monitorar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chat_conector text,
  ADD COLUMN IF NOT EXISTS chat_id_externo text,
  ADD COLUMN IF NOT EXISTS chat_ultima_coleta timestamptz,
  ADD COLUMN IF NOT EXISTS chat_ultima_msg_em timestamptz,
  ADD COLUMN IF NOT EXISTS chat_ultimo_erro text,
  ADD COLUMN IF NOT EXISTS chat_erros_seguidos integer NOT NULL DEFAULT 0;

-- O worker só olha licitações com monitoramento ligado.
CREATE INDEX IF NOT EXISTS idx_lic_chat_monitorar
  ON public.licitacoes (equipe_id) WHERE chat_monitorar;

-- Índices do chat: o parcial era duplicado do único (licitacao_id, externo_id) e
-- idx_chat_lic é prefixo do composto abaixo, que também serve à ordenação por hora.
DROP INDEX IF EXISTS public.chat_mensagens_externo_uniq;
CREATE INDEX IF NOT EXISTS idx_chat_lic_enviada
  ON public.chat_mensagens (licitacao_id, enviada_em);
DROP INDEX IF EXISTS public.idx_chat_lic;

-- Palavras-chave por equipe (a tabela palavras_chave antiga é por usuário e nunca teve tela).
CREATE TABLE IF NOT EXISTS public.chat_palavras_chave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  palavra text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (equipe_id, palavra)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_palavras_chave TO authenticated;
GRANT ALL ON public.chat_palavras_chave TO service_role;
ALTER TABLE public.chat_palavras_chave ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_palavras_equipe ON public.chat_palavras_chave;
CREATE POLICY chat_palavras_equipe ON public.chat_palavras_chave
  FOR ALL TO authenticated
  USING (equipe_id = public.current_equipe_id())
  WITH CHECK (equipe_id = public.current_equipe_id());

-- Token de sessão renovado pelos conectores (ex.: Compras.gov.br). Só o service_role lê.
-- Sem isso, cada execução do worker (sem estado) recomeçaria de um token já vencido.
CREATE TABLE IF NOT EXISTS public.conector_sessoes (
  slug text PRIMARY KEY,
  token text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conector_sessoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conector_sessoes FROM anon, authenticated;
GRANT ALL ON public.conector_sessoes TO service_role;
