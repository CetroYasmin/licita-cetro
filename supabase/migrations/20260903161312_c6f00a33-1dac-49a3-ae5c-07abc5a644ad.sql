CREATE TABLE public.portais_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (equipe_id, nome)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portais_config TO authenticated;
GRANT ALL ON public.portais_config TO service_role;

ALTER TABLE public.portais_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe gerencia seus portais" ON public.portais_config
FOR ALL TO authenticated
USING (equipe_id = public.current_equipe_id())
WITH CHECK (equipe_id = public.current_equipe_id());