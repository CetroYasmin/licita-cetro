import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-captura-token",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const PAPEIS = ["pregoeiro", "sistema", "licitante", "equipe"] as const;

const schema = z.object({
  token: z.string().min(10).optional(),
  licitacao_id: z.string().uuid().optional(),
  /** Identificador da sessão no portal (nº do pregão, id da compra, URL). */
  referencia: z.string().max(300).optional(),
  portal: z.string().max(120).optional(),
  mensagens: z
    .array(
      z.object({
        externo_id: z.string().max(200).optional(),
        autor: z.string().max(200).default("Portal"),
        papel: z.enum(PAPEIS).optional(),
        mensagem: z.string().min(1).max(8000),
        enviada_em: z.string().optional(),
      }),
    )
    .min(1)
    .max(200),
});

function inferirPapel(autor: string, mensagem: string): (typeof PAPEIS)[number] {
  const a = autor.toLowerCase();
  if (/pregoeiro|agente de contrata|presidente|comiss/.test(a)) return "pregoeiro";
  if (/sistema|autom|servidor/.test(a) || /^\s*(lance|proposta) (registrad|acatad)/i.test(mensagem))
    return "sistema";
  return "licitante";
}

export const Route = createFileRoute("/api/public/chat-ingest")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return json({ erro: "JSON inválido" }, 400);
        }

        const parsed = schema.safeParse(corpo);
        if (!parsed.success) {
          return json({ erro: "Payload inválido", detalhes: parsed.error.flatten() }, 400);
        }
        const data = parsed.data;
        const token = request.headers.get("x-captura-token") ?? data.token;
        if (!token) return json({ erro: "Token de captura ausente" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: chave } = await supabaseAdmin
          .from("captura_tokens")
          .select("id, equipe_id, ativo")
          .eq("token", token)
          .maybeSingle();

        if (!chave || !chave.ativo) return json({ erro: "Token inválido ou desativado" }, 401);

        let licitacaoId = data.licitacao_id ?? null;
        if (licitacaoId) {
          const { data: lic } = await supabaseAdmin
            .from("licitacoes")
            .select("id")
            .eq("id", licitacaoId)
            .eq("equipe_id", chave.equipe_id)
            .maybeSingle();
          if (!lic) return json({ erro: "Licitação não encontrada para esta equipe" }, 404);
        } else if (data.referencia) {
          const ref = data.referencia.trim();
          const { data: achadas } = await supabaseAdmin
            .from("licitacoes")
            .select("id, numero, fonte_id, site_url")
            .eq("equipe_id", chave.equipe_id)
            .or(
              [
                `numero.ilike.%${ref}%`,
                `fonte_id.ilike.%${ref}%`,
                `site_url.ilike.%${ref}%`,
                `processo_administrativo.ilike.%${ref}%`,
              ].join(","),
            )
            .limit(2);
          if (!achadas || achadas.length === 0) {
            return json(
              {
                erro: "Nenhuma licitação da equipe corresponde à referência informada",
                referencia: ref,
              },
              404,
            );
          }
          licitacaoId = achadas[0]!.id;
        } else {
          return json({ erro: "Informe licitacao_id ou referencia" }, 400);
        }

        const linhas = data.mensagens.map((m) => ({
          licitacao_id: licitacaoId!,
          equipe_id: chave.equipe_id,
          autor: m.autor,
          papel: m.papel ?? inferirPapel(m.autor, m.mensagem),
          origem: data.portal ?? "portal",
          mensagem: m.mensagem,
          enviada_em: m.enviada_em ?? new Date().toISOString(),
          externo_id: m.externo_id ?? null,
          referencia_externa: data.referencia ?? null,
        }));

        const comId = linhas.filter((l) => l.externo_id);
        const semId = linhas.filter((l) => !l.externo_id);

        let gravadas = 0;
        if (comId.length > 0) {
          const { data: ins, error } = await supabaseAdmin
            .from("chat_mensagens")
            .upsert(comId, { onConflict: "licitacao_id,externo_id", ignoreDuplicates: true })
            .select("id");
          if (error) return json({ erro: error.message }, 500);
          gravadas += ins?.length ?? 0;
        }
        if (semId.length > 0) {
          const { data: ins, error } = await supabaseAdmin
            .from("chat_mensagens")
            .insert(semId)
            .select("id");
          if (error) return json({ erro: error.message }, 500);
          gravadas += ins?.length ?? 0;
        }

        await supabaseAdmin
          .from("captura_tokens")
          .update({ ultimo_uso_em: new Date().toISOString() })
          .eq("id", chave.id);

        return json({ ok: true, licitacao_id: licitacaoId, recebidas: linhas.length, gravadas });
      },
    },
  },
});
