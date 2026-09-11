ALTER TABLE public.licitacoes
  ADD COLUMN IF NOT EXISTS aprovacao_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS aprovacao_observacao text,
  ADD COLUMN IF NOT EXISTS aprovacao_autor_nome text,
  ADD COLUMN IF NOT EXISTS aprovacao_autor_id uuid,
  ADD COLUMN IF NOT EXISTS aprovacao_em timestamp with time zone;

ALTER TABLE public.licitacoes
  ADD CONSTRAINT licitacoes_aprovacao_status_check
  CHECK (aprovacao_status IN ('pendente','aprovada','reprovada'));