CREATE TABLE public.anotacoes_pesquisa (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  fonte_id text NOT NULL,
  texto text NOT NULL DEFAULT '',
  autor_id uuid,
  autor_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (equipe_id, fonte_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anotacoes_pesquisa TO authenticated;
GRANT ALL ON public.anotacoes_pesquisa TO service_role;
ALTER TABLE public.anotacoes_pesquisa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipe pode gerenciar anotacoes da pesquisa" ON public.anotacoes_pesquisa FOR ALL TO authenticated USING (equipe_id = public.current_equipe_id()) WITH CHECK (equipe_id = public.current_equipe_id());
CREATE TRIGGER anotacoes_pesquisa_updated_at BEFORE UPDATE ON public.anotacoes_pesquisa FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();