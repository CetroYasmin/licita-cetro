import { createFileRoute } from "@tanstack/react-router";

/**
 * Recebe o token de sessão do Compras.gov.br capturado automaticamente pelo
 * userscript (Tampermonkey) rodando no navegador de quem usa o portal no dia
 * a dia. Grava direto em `conector_sessoes` — não depende de publicar o app,
 * como dependia o segredo COMPRASNET_API_TOKEN.
 *
 * Protegida por um segredo próprio (COMPRASNET_TOKEN_INGEST_SECRET), diferente
 * do LOVABLE_CRON_SECRET: esse endpoint só grava uma credencial, o cron só lê
 * dados já existentes — não faz sentido compartilhar o mesmo segredo entre os
 * dois nem reaproveitar o helper gerado pelo Lovable, que é específico do cron.
 */
export const Route = createFileRoute("/api/public/hooks/comprasnet-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = process.env["COMPRASNET_TOKEN_INGEST_SECRET"];
        if (!segredo) {
          return new Response("Server configuration error", { status: 500 });
        }

        const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
        const recebido = match?.[1];
        if (!recebido) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { timingSafeEqual, createHash } = await import("node:crypto");
        const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
        const a = digest(recebido);
        const b = digest(segredo);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return new Response("JSON inválido", { status: 400 });
        }
        const token = (corpo as { token?: unknown } | null)?.token;
        if (typeof token !== "string" || token.trim().length < 20) {
          return new Response("Campo 'token' ausente ou muito curto", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sessaoStore } = await import("@/services/monitoring/sessoes");
        try {
          await sessaoStore(supabaseAdmin).salvar("comprasnet", token.trim());
        } catch (e) {
          console.error(
            "[comprasnet-token] falha ao gravar sessão:",
            e instanceof Error ? e.message : e,
          );
          return Response.json({ erro: "Falha ao gravar." }, { status: 500 });
        }
        return Response.json({ ok: true as const });
      },
    },
  },
});
