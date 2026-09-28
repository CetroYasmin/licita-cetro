-- Metadados novos em portais_acessos
ALTER TABLE public.portais_acessos
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS criado_por_nome text,
  ADD COLUMN IF NOT EXISTS tem_senha boolean NOT NULL DEFAULT false;

-- A senha em texto puro nunca mais é gravada nesta tabela (a coluna fica sem uso).
ALTER TABLE public.portais_acessos DROP CONSTRAINT IF EXISTS portais_acessos_senha_vazia;
ALTER TABLE public.portais_acessos ADD CONSTRAINT portais_acessos_senha_vazia CHECK (senha IS NULL);

-- Senhas criptografadas: só o service_role (funções de servidor) acessa.
CREATE TABLE IF NOT EXISTS public.portais_credenciais (
  acesso_id uuid PRIMARY KEY REFERENCES public.portais_acessos(id) ON DELETE CASCADE,
  senha_cifrada text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);
ALTER TABLE public.portais_credenciais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portais_credenciais FROM anon, authenticated;
GRANT ALL ON public.portais_credenciais TO service_role;

-- Registro de quem definiu/removeu/revelou senhas: só o service_role acessa.
CREATE TABLE IF NOT EXISTS public.portais_acessos_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acesso_id uuid REFERENCES public.portais_acessos(id) ON DELETE SET NULL,
  equipe_id uuid NOT NULL,
  user_id uuid NOT NULL,
  user_nome text,
  acao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portais_auditoria_acesso ON public.portais_acessos_auditoria (acesso_id, created_at DESC);
ALTER TABLE public.portais_acessos_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portais_acessos_auditoria FROM anon, authenticated;
GRANT ALL ON public.portais_acessos_auditoria TO service_role;