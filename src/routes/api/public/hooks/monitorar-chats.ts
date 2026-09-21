import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Worker do monitoramento de chat. Deve ser chamado a cada minuto pelo agendador
 * (pg_cron/pg_net ou o cron do Lovable) com `Authorization: Bearer <LOVABLE_CRON_SECRET>`.
 * Sem o segredo correto responde 401 — a rota pode ficar pública com segurança.
 */
export const Route = createFileRoute("/api/public/hooks/monitorar-chats")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const negado = await authenticateCronRequest(request);
        if (negado) return negado;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { MonitoringService } = await import("@/services/monitoring/MonitoringService");
        const { sessaoStore } = await import("@/services/monitoring/sessoes");
        const { canalTelegram } = await import("@/services/notifications/notifier");

        const telegram = canalTelegram();
        try {
          const service = new MonitoringService(supabaseAdmin, {
            conectores: { sessoes: sessaoStore(supabaseAdmin) },
            canais: telegram ? [telegram] : [],
          });
          return Response.json(await service.sincronizar());
        } catch (e) {
          console.error("[monitoramento] falha na rodada:", e instanceof Error ? e.message : e);
          return Response.json({ erro: "Falha ao executar a rodada." }, { status: 500 });
        }
      },
    },
  },
});
