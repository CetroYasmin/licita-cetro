CREATE TABLE public.portais_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cpf text,
  url text,
  tipo text NOT NULL DEFAULT 'Portal',
  vencimento date,
  login text,
  senha text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portais_acessos TO authenticated;
GRANT ALL ON public.portais_acessos TO service_role;

ALTER TABLE public.portais_acessos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe gerencia seus acessos" ON public.portais_acessos
  FOR ALL TO authenticated
  USING (equipe_id = public.current_equipe_id())
  WITH CHECK (equipe_id = public.current_equipe_id());

CREATE TRIGGER portais_acessos_updated_at
  BEFORE UPDATE ON public.portais_acessos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();