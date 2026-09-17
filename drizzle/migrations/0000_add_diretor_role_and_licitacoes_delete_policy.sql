ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'diretor';

DROP POLICY IF EXISTS licitacoes_equipe ON public.licitacoes;

CREATE POLICY licitacoes_equipe_select ON public.licitacoes
  FOR SELECT TO authenticated
  USING (equipe_id = public.current_equipe_id());

CREATE POLICY licitacoes_equipe_insert ON public.licitacoes
  FOR INSERT TO authenticated
  WITH CHECK (equipe_id = public.current_equipe_id());

CREATE POLICY licitacoes_equipe_update ON public.licitacoes
  FOR UPDATE TO authenticated
  USING (equipe_id = public.current_equipe_id())
  WITH CHECK (equipe_id = public.current_equipe_id());

CREATE POLICY licitacoes_equipe_delete ON public.licitacoes
  FOR DELETE TO authenticated
  USING (
    equipe_id = public.current_equipe_id()
    AND (public.has_role(auth.uid(), 'admin') OR created_by = auth.uid())
  );