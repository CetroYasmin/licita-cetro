import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MonitoringService } from "./MonitoringService";

const syncSchema = z.object({ pregao_id: z.string().uuid().optional() });

/** Worker de monitoramento: chamado periodicamente pelo frontend monitorando. */
export const sincronizarMonitoramento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => syncSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("equipe_id, status")
      .eq("id", context.userId)
      .maybeSingle();

    if (!perfil || perfil.status !== "aprovado") {
      return { pregoes_processados: 0, mensagens_novas: 0, notificacoes: 0 };
    }

    const service = new MonitoringService(
      context.supabase,
      context.userId,
      perfil.equipe_id ?? null,
    );
    return service.sincronizar(data.pregao_id);
  });

const toggleSchema = z.object({
  pregao_id: z.string().uuid(),
  ativo: z.boolean(),
});

/** Liga/desliga o monitoramento de um pregão para o usuário atual. */
export const definirMonitoramento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => toggleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("monitoramentos").upsert(
      {
        user_id: context.userId,
        pregao_id: data.pregao_id,
        ativo: data.ativo,
      },
      { onConflict: "user_id,pregao_id" },
    );
    if (error) throw error;
    return { ok: true, ativo: data.ativo };
  });
