import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { linkEPortalReais, partesDoFonteId } from "@/lib/pncp.functions";
import {
  PORTAL_COMPRASNET,
  idCompraComprasNet,
  nomePortal,
  portalDisputaDe,
  type StatusChat,
} from "@/lib/portalDisputa";

const CAMPOS =
  "id, portal, portal_manual, site_url, fonte, fonte_id, chat_monitorar, chat_conector, chat_id_externo, chat_config_manual, chat_status" as const;

/** Estados em que a detecção automática ainda pode mexer no chat. */
const PENDENTES = new Set<string | null>([
  null,
  "aguardando_credencial",
  "sem_id",
  "coleta_indisponivel",
  "portal_desconhecido",
]);

async function linkRealDoPncp(fonteId: string): Promise<{ link: string | null; portal: string | null }> {
  const p = partesDoFonteId(fonteId);
  if (!p) return { link: null, portal: null };
  try {
    const r = await fetch(
      `https://pncp.gov.br/api/consulta/v1/orgaos/${p.cnpj}/compras/${p.ano}/${p.sequencial}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return { link: null, portal: null };
    const payload = (await r.json()) as any;
    const bruto = Array.isArray(payload) ? payload[0] : (payload?.data ?? payload);
    return linkEPortalReais(bruto);
  } catch {
    return { link: null, portal: null };
  }
}

/** Também é usado pelo worker, para não depender da abertura da página de chat. */
export async function detectarPortaisPendentes(
  db: import("@supabase/supabase-js").SupabaseClient<Database>,
  ids?: string[],
) {
    let q = db.from("licitacoes").select(CAMPOS).limit(200);
    if (ids?.length) q = q.in("id", ids);
    else q = q.or("chat_status.is.null,chat_status.in.(portal_desconhecido,sem_id,aguardando_credencial)");
    const { data: linhas, error } = await q;
    if (error) throw error;

    // Credencial do Compras.gov.br: segredo ou token renovado guardado.
    let credencialComprasNet = !!process.env["COMPRASNET_API_TOKEN"]?.trim();
    if (!credencialComprasNet) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: s } = await supabaseAdmin
        .from("conector_sessoes")
        .select("slug")
        .eq("slug", "comprasnet")
        .maybeSingle();
      credencialComprasNet = !!s;
    }

    let consultasPncp = 0;
    let atualizadas = 0;
    for (const l of linhas ?? []) {
      const upd: Database["public"]["Tables"]["licitacoes"]["Update"] = {};
      let portal = portalDisputaDe(l);
      let link = l.site_url && !/pncp\.gov\.br/i.test(l.site_url) ? l.site_url : null;

      if (!l.portal_manual) {
        if (!portal && link) {
          const n = nomePortal(link);
          if (n !== "PNCP" && n !== "Não informado") portal = n;
        }
        // A rodada do cron precisa terminar antes da próxima execução.
        if ((!portal || !link) && l.fonte === "PNCP" && l.fonte_id && consultasPncp < (ids?.length ? 25 : 2)) {
          consultasPncp++;
          const real = await linkRealDoPncp(l.fonte_id);
          if (!portal && real.portal) portal = real.portal;
          if (!link && real.link) {
            link = real.link;
            if (!l.site_url || /pncp\.gov\.br/i.test(l.site_url)) upd["site_url"] = real.link;
          }
        }
        if (portal && portal !== l.portal) upd["portal"] = portal;
      }

      if (!l.chat_config_manual && !l.chat_monitorar && PENDENTES.has(l.chat_status)) {
        let status: StatusChat;
        let motivo: string;
        if (!portal) {
          status = "portal_desconhecido";
          motivo = "Nenhum link ou dado estruturado indica o portal da sessão. Informe o portal manualmente.";
        } else if (portal === PORTAL_COMPRASNET) {
          const id = idCompraComprasNet(link);
          if (!id) {
            status = "sem_id";
            motivo = "Compras.gov.br identificado, mas o link não traz o código da compra (UASG). Informe o ID na aba Chat da licitação.";
          } else {
            upd["chat_conector"] = "comprasnet";
            upd["chat_id_externo"] = id;
            if (credencialComprasNet) {
              status = "monitorando";
              motivo = "Ligado automaticamente a partir do link da compra.";
              upd["chat_monitorar"] = true;
              upd["chat_ligado_em"] = new Date().toISOString();
              upd["chat_erros_seguidos"] = 0;
              upd["chat_ultimo_erro"] = null;
            } else {
              status = "aguardando_credencial";
              motivo = "Compra identificada, mas o acesso de fornecedor ao Compras.gov.br não está configurado.";
            }
          }
        } else {
          status = "coleta_indisponivel";
          motivo = `${portal}: não há acesso público/legítimo ao chat deste portal integrado ao app. Acompanhe no próprio portal.`;
        }
        if (status !== l.chat_status) {
          upd["chat_status"] = status;
          upd["chat_status_motivo"] = motivo;
        }
      }

      if (Object.keys(upd).length > 0) {
        const { error: e } = await db.from("licitacoes").update(upd).eq("id", l.id);
        if (!e) atualizadas++;
      }
    }
    return { analisadas: linhas?.length ?? 0, atualizadas };
}

/**
 * Detecta o portal da disputa e o ID da compra das licitações da equipe e
 * liga o chat só quando há conector real + ID confiável + credencial.
 * Nunca sobrescreve portal ou configuração de chat escolhidos à mão.
 */
export const detectarPortais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(200).optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    return detectarPortaisPendentes(context.supabase, data.ids);
  });
