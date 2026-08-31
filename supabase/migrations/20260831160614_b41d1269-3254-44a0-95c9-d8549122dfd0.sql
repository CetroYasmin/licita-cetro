
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','membro');
CREATE TYPE public.perfil_status AS ENUM ('pendente','aprovado','bloqueado');

-- EQUIPES
CREATE TABLE public.equipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipes TO authenticated;
GRANT ALL ON public.equipes TO service_role;
ALTER TABLE public.equipes ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  nome text,
  empresa_nome text,
  empresa_cnpj text,
  telefone text,
  status public.perfil_status NOT NULL DEFAULT 'pendente',
  equipe_id uuid REFERENCES public.equipes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- HELPERS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_equipe_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT equipe_id FROM public.profiles WHERE id = auth.uid() AND status = 'aprovado';
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_equipe uuid; v_first boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO v_first;
  INSERT INTO public.equipes (nome)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'empresa_nome', NEW.email))
  RETURNING id INTO v_equipe;

  INSERT INTO public.profiles (id, email, nome, empresa_nome, empresa_cnpj, telefone, status, equipe_id)
  VALUES (
    NEW.id, NEW.email,
    NEW.raw_user_meta_data->>'nome',
    NEW.raw_user_meta_data->>'empresa_nome',
    NEW.raw_user_meta_data->>'empresa_cnpj',
    NEW.raw_user_meta_data->>'telefone',
    CASE WHEN v_first THEN 'aprovado'::public.perfil_status ELSE 'pendente'::public.perfil_status END,
    v_equipe
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN v_first THEN 'admin'::public.app_role ELSE 'membro'::public.app_role END);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- POLICIES: profiles / equipes / roles
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_select_equipe" ON public.profiles FOR SELECT TO authenticated USING (equipe_id = public.current_equipe_id());
CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND status = (SELECT p.status FROM public.profiles p WHERE p.id = auth.uid()));
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "equipes_select" ON public.equipes FOR SELECT TO authenticated USING (id = public.current_equipe_id() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "equipes_update_admin" ON public.equipes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "equipes_insert_admin" ON public.equipes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- LICITACOES
CREATE TABLE public.licitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  created_by uuid,
  numero text NOT NULL,
  modalidade text,
  orgao text,
  objeto text,
  natureza text,
  data_publicacao date,
  data_abertura date,
  data_sessao timestamptz,
  plataforma text,
  portal text,
  site_url text,
  processo_administrativo text,
  valor_estimado numeric,
  qtd_itens integer,
  qtd_lotes integer,
  cidade text,
  uf text,
  status text NOT NULL DEFAULT 'publicada',
  proximo_evento text,
  proximo_evento_data timestamptz,
  ultima_atualizacao timestamptz NOT NULL DEFAULT now(),
  favorito boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  observacoes text,
  responsavel_id uuid,
  pasta_id uuid,
  posicao_empresa integer,
  valor_ofertado numeric,
  melhor_valor numeric,
  situacao_empresa text,
  situacao_proposta text,
  motivo_desclassificacao text,
  resultado_final text,
  qtd_concorrentes integer,
  fonte text,
  fonte_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (equipe_id, fonte, fonte_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licitacoes TO authenticated;
GRANT ALL ON public.licitacoes TO service_role;
ALTER TABLE public.licitacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "licitacoes_equipe" ON public.licitacoes FOR ALL TO authenticated
USING (equipe_id = public.current_equipe_id()) WITH CHECK (equipe_id = public.current_equipe_id());
CREATE TRIGGER licitacoes_updated_at BEFORE UPDATE ON public.licitacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PASTAS
CREATE TABLE public.pastas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pastas TO authenticated;
GRANT ALL ON public.pastas TO service_role;
ALTER TABLE public.pastas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pastas_equipe" ON public.pastas FOR ALL TO authenticated
USING (equipe_id = public.current_equipe_id()) WITH CHECK (equipe_id = public.current_equipe_id());

-- ITENS
CREATE TABLE public.licitacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id uuid NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  numero_item text,
  lote text,
  descricao text,
  quantidade numeric,
  unidade text,
  valor_unitario_estimado numeric,
  valor_total_estimado numeric,
  valor_ofertado numeric,
  melhor_valor numeric,
  posicao_empresa integer,
  situacao text,
  participando boolean NOT NULL DEFAULT false,
  empresa_vencedora text,
  valor_vencedor numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licitacao_itens TO authenticated;
GRANT ALL ON public.licitacao_itens TO service_role;
ALTER TABLE public.licitacao_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itens_equipe" ON public.licitacao_itens FOR ALL TO authenticated
USING (equipe_id = public.current_equipe_id()) WITH CHECK (equipe_id = public.current_equipe_id());

-- MOVIMENTACOES
CREATE TABLE public.movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id uuid NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'evento',
  descricao text NOT NULL,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  autor_id uuid,
  autor_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimentacoes TO authenticated;
GRANT ALL ON public.movimentacoes TO service_role;
ALTER TABLE public.movimentacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mov_equipe" ON public.movimentacoes FOR ALL TO authenticated
USING (equipe_id = public.current_equipe_id()) WITH CHECK (equipe_id = public.current_equipe_id());

-- CONCORRENTES
CREATE TABLE public.concorrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id uuid NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cnpj text,
  posicao integer,
  valor_ofertado numeric,
  vencedor boolean NOT NULL DEFAULT false,
  situacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concorrentes TO authenticated;
GRANT ALL ON public.concorrentes TO service_role;
ALTER TABLE public.concorrentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conc_equipe" ON public.concorrentes FOR ALL TO authenticated
USING (equipe_id = public.current_equipe_id()) WITH CHECK (equipe_id = public.current_equipe_id());

-- LANCES
CREATE TABLE public.lances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id uuid NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.licitacao_itens(id) ON DELETE SET NULL,
  empresa text NOT NULL,
  cnpj text,
  valor numeric NOT NULL,
  posicao integer,
  minha_empresa boolean NOT NULL DEFAULT false,
  registrado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lances TO authenticated;
GRANT ALL ON public.lances TO service_role;
ALTER TABLE public.lances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lances_equipe" ON public.lances FOR ALL TO authenticated
USING (equipe_id = public.current_equipe_id()) WITH CHECK (equipe_id = public.current_equipe_id());

-- DOCUMENTOS
CREATE TABLE public.documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id uuid NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'anexo',
  nome text NOT NULL,
  url text,
  storage_path text,
  publicado_em timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos TO authenticated;
GRANT ALL ON public.documentos TO service_role;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docs_equipe" ON public.documentos FOR ALL TO authenticated
USING (equipe_id = public.current_equipe_id()) WITH CHECK (equipe_id = public.current_equipe_id());

-- PRAZOS
CREATE TABLE public.prazos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id uuid NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descricao text,
  data_limite timestamptz NOT NULL,
  concluido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prazos TO authenticated;
GRANT ALL ON public.prazos TO service_role;
ALTER TABLE public.prazos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prazos_equipe" ON public.prazos FOR ALL TO authenticated
USING (equipe_id = public.current_equipe_id()) WITH CHECK (equipe_id = public.current_equipe_id());

-- TAREFAS
CREATE TABLE public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id uuid REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  responsavel_id uuid,
  prazo timestamptz,
  concluida boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas TO authenticated;
GRANT ALL ON public.tarefas TO service_role;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tarefas_equipe" ON public.tarefas FOR ALL TO authenticated
USING (equipe_id = public.current_equipe_id()) WITH CHECK (equipe_id = public.current_equipe_id());

-- CHAT
CREATE TABLE public.chat_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id uuid NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  autor text NOT NULL,
  origem text NOT NULL DEFAULT 'portal',
  mensagem text NOT NULL,
  enviada_em timestamptz NOT NULL DEFAULT now(),
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_mensagens TO authenticated;
GRANT ALL ON public.chat_mensagens TO service_role;
ALTER TABLE public.chat_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_equipe" ON public.chat_mensagens FOR ALL TO authenticated
USING (equipe_id = public.current_equipe_id()) WITH CHECK (equipe_id = public.current_equipe_id());

-- ALERTAS
CREATE TABLE public.alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  licitacao_id uuid REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text,
  lida boolean NOT NULL DEFAULT false,
  autor_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alertas TO authenticated;
GRANT ALL ON public.alertas TO service_role;
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alertas_equipe" ON public.alertas FOR ALL TO authenticated
USING (equipe_id = public.current_equipe_id()) WITH CHECK (equipe_id = public.current_equipe_id());

CREATE INDEX idx_lic_equipe ON public.licitacoes(equipe_id);
CREATE INDEX idx_lic_sessao ON public.licitacoes(data_sessao);
CREATE INDEX idx_itens_lic ON public.licitacao_itens(licitacao_id);
CREATE INDEX idx_mov_lic ON public.movimentacoes(licitacao_id);
CREATE INDEX idx_chat_lic ON public.chat_mensagens(licitacao_id);
CREATE INDEX idx_alertas_equipe ON public.alertas(equipe_id, lida);
