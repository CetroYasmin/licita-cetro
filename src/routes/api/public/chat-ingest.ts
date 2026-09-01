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

/* ---------- Formato nativo do Compras.gov.br (ComprasNet /mensagens) ---------- */

const comprasMsg = z.object({
  chaveCompra: z
    .object({
      numero: z.union([z.number(), z.string()]).optional(),
      ano: z.union([z.number(), z.string()]).optional(),
      numeroUasg: z.union([z.number(), z.string()]).optional(),
      idUasgIdentificacao: z.union([z.number(), z.string()]).optional(),
      idModalidade: z.union([z.number(), z.string()]).optional(),
    })
    .optional(),
  identificadorItem: z.string().optional(),
  chaveMensagemNaOrigem: z.string().max(200).optional(),
  texto: z.string().min(1),
  categoria: z.string().optional(),
  dataHora: z.string().optional(),
  tipoRemetente: z.string().optional(),
  identificadorRemetente: z.string().optional(),
  identificadorDestinatario: z.string().optional(),
});

const comprasSchema = z.union([
  z.array(comprasMsg).min(1).max(300),
  z.object({ mensagens: z.array(comprasMsg).min(1).max(300) }),
]);

/**
 * tipoRemetente do ComprasNet:
 * 0 e 1 = mensagens automáticas do sistema/convocações
 * 3 = pregoeiro / agente de contratação
 * demais = licitante
 */
function papelCompras(tipo?: string): (typeof PAPEIS)[number] {
  if (tipo === "3") return "pregoeiro";
  if (tipo === "0" || tipo === "1") return "sistema";
  return "licitante";
}

function autorCompras(papel: (typeof PAPEIS)[number]): string {
  if (papel === "pregoeiro") return "Pregoeiro";
  if (papel === "sistema") return "Sistema";
  return "Licitante";
}

/**
 * Converte qualquer data recebida do portal para ISO.
 * Aceita "2026-09-01 11:19:10.361" (horário de Brasília), "01/09/2026 11:19[:00]"
 * e ISO com offset. Quando não dá para entender, devolve undefined (usa-se "agora"),
 * porque um texto solto quebraria a gravação no banco.
 */
function paraIso(valor?: string): string | undefined {
  if (!valor) return undefined;
  const v = valor.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(v);
  if (iso) {
    const offset = iso[8] ?? "-03:00";
    return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[6] ?? "00"}${iso[7] ?? ""}${offset === "Z" ? "Z" : offset}`;
  }

  const br = /^(\d{2})\/(\d{2})\/(\d{4})[ T,]+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(v);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}T${br[4]}:${br[5]}:${br[6] ?? "00"}-03:00`;
  }

  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

const dataCompras = paraIso;


type Canonico = z.infer<typeof schema>;

function normalizarCompras(corpo: unknown): Canonico | null {
  const p = comprasSchema.safeParse(corpo);
  if (!p.success) return null;
  const itens = Array.isArray(p.data) ? p.data : p.data.mensagens;
  const chave = itens.find((m) => m.chaveCompra)?.chaveCompra;
  const referencia =
    chave?.numero != null && chave?.ano != null
      ? `${chave.numero}/${chave.ano}`
      : chave?.numeroUasg != null
        ? String(chave.numeroUasg)
        : undefined;

  return {
    portal: "Compras.gov.br",
    ...(referencia ? { referencia } : {}),
    mensagens: itens.map((m) => {
      const papel = papelCompras(m.tipoRemetente);
      const prefixoItem = m.identificadorItem ? `[Item ${m.identificadorItem}] ` : "";
      return {
        ...(m.chaveMensagemNaOrigem ? { externo_id: m.chaveMensagemNaOrigem } : {}),
        autor: autorCompras(papel),
        papel,
        mensagem: `${prefixoItem}${m.texto}`.slice(0, 8000),
        ...(dataCompras(m.dataHora) ? { enviada_em: dataCompras(m.dataHora)! } : {}),
      };
    }),
  };
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

        const url = new URL(request.url);
        const refQuery = url.searchParams.get("referencia") ?? undefined;
        const licQuery = url.searchParams.get("licitacao_id") ?? undefined;

        const nativo = normalizarCompras(corpo);
        const parsed = nativo
          ? ({ success: true, data: nativo } as const)
          : schema.safeParse(corpo);
        if (!parsed.success) {
          return json({ erro: "Payload inválido", detalhes: parsed.error.flatten() }, 400);
        }
        const data: Canonico = {
          ...parsed.data,
          ...(parsed.data.referencia ? {} : refQuery ? { referencia: refQuery } : {}),
          ...(parsed.data.licitacao_id ? {} : licQuery ? { licitacao_id: licQuery } : {}),
        };

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
            // Cria um registro mínimo para não perder mensagens de uma sessão ainda não cadastrada.
            const { data: nova, error: erroNova } = await supabaseAdmin
              .from("licitacoes")
              .insert({
                equipe_id: chave.equipe_id,
                numero: ref,
                portal: data.portal ?? "portal",
                plataforma: data.portal ?? null,
                status: "em_disputa",
                fonte: "captura",
                fonte_id: ref,
                objeto: "Sessão capturada pelo chat (cadastro automático)",
              })
              .select("id")
              .single();
            if (erroNova || !nova) {
              return json({ erro: erroNova?.message ?? "Falha ao criar licitação" }, 500);
            }
            licitacaoId = nova.id;
          } else {
            licitacaoId = achadas[0]!.id;
          }

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
