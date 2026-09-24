import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { connectorExiste, connectorsDisponiveis } from "@/connectors";
import { partesDaCompra } from "@/connectors/ComprasNetConnector";
import { idLicitacaoBll } from "@/lib/portalDisputa";
import { MonitoringService } from "./MonitoringService";

/** Portais que já têm conector, com a orientação de como preencher o identificador da compra. */
export const listarConectores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => connectorsDisponiveis());

const configSchema = z.object({
  licitacao_id: z.string().uuid(),
  monitorar: z.boolean(),
  conector: z.string().trim().max(60).nullable(),
  id_externo: z.string().trim().max(120).nullable(),
});

/** Liga/desliga o monitoramento do chat de uma licitação e guarda de onde ler. */
export const configurarChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => configSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.monitorar) {
      if (!data.conector || !connectorExiste(data.conector)) {
        throw new Error("Escolha um portal com monitoramento disponível.");
      }
      if (!data.id_externo) {
        throw new Error("Informe o identificador da compra no portal.");
      }
      // O Compras.gov.br reaproveita o mesmo número de compra em órgãos
      // diferentes; sem a UASG, duas licitações distintas com número/ano
      // iguais acabariam misturando o chat uma da outra.
      if (data.conector === "comprasnet" && partesDaCompra(data.id_externo).uasg == null) {
        throw new Error(
          "Informe a UASG também: use o formato UASG-modalidade-número-ano (ex.: 981547-5-118-2026). Só número/ano não identifica a compra com segurança, porque o mesmo número se repete em órgãos diferentes.",
        );
      }
      if (data.conector === "bll") {
        const { data: lic, error: erroLic } = await context.supabase
          .from("licitacoes").select("numero, portal, site_url").eq("id", data.licitacao_id).maybeSingle();
        if (erroLic || !lic) throw new Error("Licitação não encontrada.");
        const id = idLicitacaoBll(data.id_externo);
        if (!id || id !== idLicitacaoBll(lic.numero)) {
          throw new Error("Use o número/ano desta licitação no BLL, por exemplo 10.015/2026. Não use UASG.");
        }
        if (!/bll/i.test(lic.portal ?? "") && !/bllcompras\.com/i.test(lic.site_url ?? "")) {
          throw new Error("Identifique primeiro o portal da disputa desta licitação como BLL Compras.");
        }
      }
    }
    const { data: linha, error } = await context.supabase
      .from("licitacoes")
      .update({
        chat_monitorar: data.monitorar,
        chat_conector: data.conector,
        chat_id_externo: data.id_externo,
        chat_erros_seguidos: 0,
        chat_config_manual: true,
        chat_status: data.monitorar ? "monitorando" : "manual",
        chat_status_motivo: data.monitorar
          ? data.conector === "bll" ? "Aguardando o chat BLL aberto no navegador com Tampermonkey." : "Ligado manualmente."
          : "Desligado manualmente.",
        // Ligou agora → a válvula de "muito tempo sem mensagens" conta a
        // partir daqui, não da data (possivelmente antiga) da sessão.
        ...(data.monitorar ? { chat_ligado_em: new Date().toISOString() } : {}),
        chat_ultimo_erro: null,
      })
      .eq("id", data.licitacao_id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!linha) throw new Error("Licitação não encontrada.");
    return { ok: true as const };
  });

const syncSchema = z.object({ licitacao_id: z.string().uuid() });

/** "Sincronizar agora": consulta o portal na hora, sem esperar o intervalo do worker. */
export const sincronizarChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => syncSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("equipe_id, status")
      .eq("id", context.userId)
      .maybeSingle();
    if (!perfil || perfil.status !== "aprovado" || !perfil.equipe_id) {
      throw new Error("Sem permissão para sincronizar.");
    }

    // Dados pelo client do usuário (respeita as regras da equipe); o client de
    // serviço entra só para ler/renovar o token de sessão do portal.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sessaoStore } = await import("./sessoes");
    const service = new MonitoringService(context.supabase, {
      conectores: { sessoes: sessaoStore(supabaseAdmin) },
    });
    return service.sincronizar({
      equipeId: perfil.equipe_id,
      licitacaoId: data.licitacao_id,
      forcar: true,
    });
  });
