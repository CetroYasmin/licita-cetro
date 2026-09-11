ALTER TABLE public.licitacoes
  ADD COLUMN IF NOT EXISTS aprovacao_resposta_solicitada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aprovacao_resposta text,
  ADD COLUMN IF NOT EXISTS aprovacao_resposta_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS aprovacao_resposta_autor_nome text;

CREATE POLICY "Equipe le arquivos da equipe"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documentos'
  AND public.current_equipe_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.current_equipe_id()::text
);

CREATE POLICY "Equipe envia arquivos da equipe"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documentos'
  AND public.current_equipe_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.current_equipe_id()::text
);

CREATE POLICY "Equipe atualiza arquivos da equipe"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documentos'
  AND public.current_equipe_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.current_equipe_id()::text
);

CREATE POLICY "Equipe remove arquivos da equipe"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documentos'
  AND public.current_equipe_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.current_equipe_id()::text
);