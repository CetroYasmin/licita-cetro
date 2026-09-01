DROP INDEX IF EXISTS public.chat_mensagens_licitacao_externo_uidx;
CREATE UNIQUE INDEX chat_mensagens_licitacao_externo_uidx ON public.chat_mensagens (licitacao_id, externo_id);