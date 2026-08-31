GRANT INSERT, DELETE ON public.user_roles TO authenticated;

CREATE POLICY roles_insert_admin ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY roles_delete_admin ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND user_id <> auth.uid());

CREATE POLICY roles_select_equipe ON public.user_roles
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.equipe_id = public.current_equipe_id()));