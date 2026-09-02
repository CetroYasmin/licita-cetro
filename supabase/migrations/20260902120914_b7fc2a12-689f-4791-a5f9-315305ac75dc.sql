
-- PORTAIS
CREATE TABLE public.portais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  base_url text,
  ativo boolean NOT NULL DEFAULT true,
  connector_type text NOT NULL DEFAULT 'mock',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.portais TO authenticated;
GRANT ALL ON public.portais TO service_role;
ALTER TABLE public.portais ENABLE ROW LEVEL SECURITY;
CREATE POLICY portais_select ON public.portais FOR SELECT TO authenticated USING (true);

-- PREGOES (auctions)
CREATE TABLE public.pregoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid REFERENCES public.equipes(id) ON DELETE CASCADE,
  portal_id uuid NOT NULL REFERENCES public.portais(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  titulo text NOT NULL,
  orgao text,
  objeto text,
  status text NOT NULL DEFAULT 'aberta',
  data_abertura timestamptz,
  monitoramento_ativo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portal_id, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pregoes TO authenticated;
GRANT ALL ON public.pregoes TO service_role;
ALTER TABLE public.pregoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY pregoes_select ON public.pregoes FOR SELECT TO authenticated
  USING (equipe_id IS NULL OR equipe_id = public.current_equipe_id());
CREATE POLICY pregoes_insert ON public.pregoes FOR INSERT TO authenticated
  WITH CHECK (equipe_id = public.current_equipe_id());
CREATE POLICY pregoes_update ON public.pregoes FOR UPDATE TO authenticated
  USING (equipe_id IS NULL OR equipe_id = public.current_equipe_id())
  WITH CHECK (equipe_id IS NULL OR equipe_id = public.current_equipe_id());
CREATE POLICY pregoes_delete ON public.pregoes FOR DELETE TO authenticated
  USING (equipe_id = public.current_equipe_id());
CREATE TRIGGER pregoes_updated_at BEFORE UPDATE ON public.pregoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- MENSAGENS
CREATE TABLE public.pregao_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid REFERENCES public.equipes(id) ON DELETE CASCADE,
  pregao_id uuid NOT NULL REFERENCES public.pregoes(id) ON DELETE CASCADE,
  portal_id uuid NOT NULL REFERENCES public.portais(id) ON DELETE CASCADE,
  external_message_id text NOT NULL,
  autor text NOT NULL,
  autor_tipo text NOT NULL DEFAULT 'licitante',
  mensagem text NOT NULL,
  mensagem_em timestamptz NOT NULL DEFAULT now(),
  coletada_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portal_id, pregao_id, external_message_id)
);
GRANT SELECT, INSERT ON public.pregao_mensagens TO authenticated;
GRANT ALL ON public.pregao_mensagens TO service_role;
ALTER TABLE public.pregao_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY msgs_select ON public.pregao_mensagens FOR SELECT TO authenticated
  USING (equipe_id IS NULL OR equipe_id = public.current_equipe_id());
CREATE POLICY msgs_insert ON public.pregao_mensagens FOR INSERT TO authenticated
  WITH CHECK (equipe_id IS NULL OR equipe_id = public.current_equipe_id());
CREATE INDEX pregao_mensagens_pregao_idx ON public.pregao_mensagens (pregao_id, mensagem_em DESC);

-- PALAVRAS-CHAVE
CREATE TABLE public.palavras_chave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  palavra text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, palavra)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.palavras_chave TO authenticated;
GRANT ALL ON public.palavras_chave TO service_role;
ALTER TABLE public.palavras_chave ENABLE ROW LEVEL SECURITY;
CREATE POLICY palavras_own ON public.palavras_chave FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- MONITORAMENTOS
CREATE TABLE public.monitoramentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pregao_id uuid NOT NULL REFERENCES public.pregoes(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pregao_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoramentos TO authenticated;
GRANT ALL ON public.monitoramentos TO service_role;
ALTER TABLE public.monitoramentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY monit_own ON public.monitoramentos FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER monitoramentos_updated_at BEFORE UPDATE ON public.monitoramentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- NOTIFICACOES
CREATE TABLE public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pregao_id uuid REFERENCES public.pregoes(id) ON DELETE CASCADE,
  mensagem_id uuid REFERENCES public.pregao_mensagens(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'palavra_chave',
  palavra text,
  titulo text NOT NULL,
  corpo text,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_own ON public.notificacoes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX notificacoes_user_idx ON public.notificacoes (user_id, created_at DESC);

-- REALTIME
ALTER TABLE public.pregao_mensagens REPLICA IDENTITY FULL;
ALTER TABLE public.notificacoes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pregao_mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;

-- SEED PORTAIS
INSERT INTO public.portais (nome, slug, base_url, ativo, connector_type) VALUES
  ('Portal Demonstração', 'mock', 'https://demo.local', true, 'mock'),
  ('Compras.gov.br', 'comprasnet', 'https://www.gov.br/compras', false, 'comprasnet'),
  ('BLL Compras', 'bll', 'https://bllcompras.com', false, 'bll'),
  ('Licitações-e', 'licitacoes-e', 'https://www.licitacoes-e.com.br', false, 'licitacoes-e'),
  ('Portal de Compras Públicas', 'portal-compras-publicas', 'https://www.portaldecompraspublicas.com.br', false, 'portal-compras-publicas');

-- SEED PREGOES FICTICIOS (visíveis para todas as equipes)
INSERT INTO public.pregoes (equipe_id, portal_id, external_id, titulo, orgao, objeto, status, data_abertura, monitoramento_ativo)
SELECT NULL, p.id, 'DEMO-123-2026', 'Pregão Eletrônico 123/2026', 'Prefeitura Municipal de Exemplo',
       'Contratação de empresa para execução de obras de engenharia civil', 'em_disputa', now(), false
FROM public.portais p WHERE p.slug = 'mock';

INSERT INTO public.pregoes (equipe_id, portal_id, external_id, titulo, orgao, objeto, status, data_abertura, monitoramento_ativo)
SELECT NULL, p.id, 'DEMO-451-2026', 'Pregão Eletrônico 451/2026', 'Secretaria Estadual de Saúde',
       'Aquisição de materiais médico-hospitalares', 'aberta', now() + interval '2 days', false
FROM public.portais p WHERE p.slug = 'mock';
