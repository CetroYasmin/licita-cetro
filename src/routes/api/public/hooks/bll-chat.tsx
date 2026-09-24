import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { normalizarLote } from "@/services/monitoring/normalizer";

const schema = z.object({
  numero: z.string().min(3).max(80),
  mensagens: z.array(z.object({
    secao: z.enum(["lote", "processo"]),
    horario: z.string().datetime({ offset: true }),
    autor: z.string().min(1).max(200),
    texto: z.string().min(1).max(10000),
  })).min(1).max(200),
});

function chaveNumero(v: string) {
  const m = /^(\d{1,8})\s*\/\s*(20\d\d)$/.exec(v.replace(/[.\s]/g, ""));
  return m ? `${Number(m[1])}/${m[2]}` : null;
}

export const Route = createFileRoute("/api/public/hooks/bll-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { createHash, timingSafeEqual } = await import("node:crypto");
        const segredo = process.env["BLL_CHAT_INGEST_SECRET"];
        const recebido = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!segredo) return new Response("Server configuration error", { status: 500 });
        if (!recebido || !timingSafeEqual(
          createHash("sha256").update(recebido).digest(),
          createHash("sha256").update(segredo).digest(),
        )) return new Response("Unauthorized", { status: 401 });
        if (Number(request.headers.get("content-length") ?? 0) > 500_000)
          return new Response("Payload too large", { status: 413 });

        let payload: z.infer<typeof schema>;
        try { payload = schema.parse(await request.json()); }
        catch { return Response.json({ erro: "Formato inválido" }, { status: 400 }); }
        const chave = chaveNumero(payload.numero);
        if (!chave) return Response.json({ erro: "Número da licitação inválido" }, { status: 400 });

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        // Nunca vincular pelo número sozinho: ele pode repetir em órgãos distintos.
        const { data: candidatas, error } = await db.from("licitacoes")
          .select("id, equipe_id, numero, portal, site_url, chat_config_manual, chat_conector")
          .or("portal.ilike.%bll%,site_url.ilike.%bllcompras.com%")
          .limit(1000);
        if (error) return Response.json({ erro: "Falha na busca" }, { status: 500 });
        const matches = (candidatas ?? []).filter((l) => chaveNumero(l.numero) === chave &&
          (/bll/i.test(l.portal ?? "") || /bllcompras\.com/i.test(l.site_url ?? "")));
        if (matches.length !== 1) return Response.json({
          erro: matches.length ? "Número ambíguo: há mais de uma licitação BLL com este número" : "Licitação BLL não encontrada",
        }, { status: 409 });
        const lic = matches[0]!;
        if (lic.chat_config_manual && lic.chat_conector !== "bll")
          return Response.json({ erro: "O chat desta licitação foi configurado manualmente para outro portal" }, { status: 409 });

        const normalizadas = normalizarLote(`bll:${lic.id}`, payload.mensagens.map((m) => ({
          author: m.autor,
          author_type: /pregoeir|sistema|plataforma/i.test(m.autor) ? "pregoeiro" : "licitante",
          message: m.texto,
          message_timestamp: m.horario,
          // O BLL não fornece ID por linha na resposta observada. A seção evita
          // colisões entre os dois históricos com horários e textos iguais.
          external_message_id: createHash("sha256").update(`${m.secao}|${m.horario}|${m.autor}|${m.texto}`).digest("hex"),
        })));
        let inseridas = 0;
        for (let i = 0; i < normalizadas.length; i += 100) {
          const { data, error: erro } = await db.from("chat_mensagens").upsert(
            normalizadas.slice(i, i + 100).map((m) => ({
              licitacao_id: lic.id, equipe_id: lic.equipe_id, externo_id: m.external_message_id,
              autor: m.author, papel: m.author_type, origem: "portal",
              mensagem: m.message, enviada_em: m.message_timestamp,
            })), { onConflict: "licitacao_id,externo_id", ignoreDuplicates: true },
          ).select("id");
          if (erro) return Response.json({ erro: "Falha ao salvar mensagens" }, { status: 500 });
          inseridas += data?.length ?? 0;
        }
        const maisRecente = normalizadas.at(-1)?.message_timestamp ?? new Date().toISOString();
        const { error: erroEstado } = await db.from("licitacoes").update({
          chat_conector: "bll", chat_id_externo: chave, chat_monitorar: true,
          chat_status: "monitorando", chat_status_motivo: "Mensagens recebidas do BLL pelo Tampermonkey enquanto o chat estiver aberto.",
          chat_ultima_coleta: new Date().toISOString(), chat_ultima_msg_em: maisRecente,
          chat_ultimo_erro: null, chat_erros_seguidos: 0,
        }).eq("id", lic.id);
        if (erroEstado) return Response.json({ erro: "Mensagens salvas, falha ao atualizar estado" }, { status: 500 });
        return Response.json({ ok: true, inseridas, licitacao: lic.numero });
      },
    },
  },
});
