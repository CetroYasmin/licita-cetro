import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { resolverConnector } from "@/connectors";
import type { ConnectorDeps, PortalConnector } from "@/connectors/PortalConnector";
import { normalizarLote } from "./normalizer";
import { combinarPalavras } from "./keywords";
import { decidir, type LicitacaoMonitorada } from "./agendamento";
import {
  canalAlertasApp,
  despachar,
  type AlertaEvento,
  type NotificationChannel,
} from "@/services/notifications/notifier";

type DB = SupabaseClient<Database>;

export type ResultadoSync = {
  /** Licitações com monitoramento ligado que entraram na análise. */
  verificadas: number;
  /** Quantas de fato foram consultadas no portal nesta rodada. */
  coletadas: number;
  mensagens_novas: number;
  alertas: number;
  falhas: number;
  encerradas: number;
};

export type OpcoesSync = {
  equipeId?: string | null;
  licitacaoId?: string | null;
  /** Ignora o intervalo de coleta (botão "Sincronizar agora"). */
  forcar?: boolean;
};

const CAMPOS =
  "id, equipe_id, numero, orgao, status, data_sessao, created_at, chat_conector, chat_id_externo, chat_ultima_coleta, chat_ultima_msg_em, chat_erros_seguidos, chat_ligado_em" as const;

/** Relemos um pouco antes da última mensagem: cobre atraso de publicação no portal. A unicidade evita duplicar. */
const SOBREPOSICAO_MS = 5 * 60_000;
const SIMULTANEAS = 4;
const PRAZO_DA_RODADA_MS = 45_000;
const MAX_ALERTAS_POR_LICITACAO = 10;
const FALHAS_ATE_AVISAR = 3;

const cortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

async function emParalelo<T>(itens: T[], limite: number, fn: (item: T) => Promise<void>) {
  let proximo = 0;
  const operarios = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (proximo < itens.length) {
      const item = itens[proximo++];
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(operarios);
}

/**
 * Orquestra o ciclo de monitoramento. Não conhece nenhum portal específico:
 * pede as mensagens ao connector, normaliza, grava só o que é novo em
 * chat_mensagens (a mesma tabela que a aba Chat já exibe), aplica as
 * palavras-chave da equipe e despacha os avisos.
 *
 * O `db` define o alcance: no worker (cron) é o client de serviço; no botão
 * "Sincronizar agora" é o client do usuário, com as regras de acesso da equipe.
 */
export class MonitoringService {
  constructor(
    private readonly db: DB,
    private readonly deps: { conectores?: ConnectorDeps; canais?: NotificationChannel[] } = {},
  ) {}

  async sincronizar(op: OpcoesSync = {}): Promise<ResultadoSync> {
    const resultado: ResultadoSync = {
      verificadas: 0,
      coletadas: 0,
      mensagens_novas: 0,
      alertas: 0,
      falhas: 0,
      encerradas: 0,
    };
    const eventos: AlertaEvento[] = [];

    let q = this.db.from("licitacoes").select(CAMPOS).eq("chat_monitorar", true);
    if (op.equipeId) q = q.eq("equipe_id", op.equipeId);
    if (op.licitacaoId) q = q.eq("id", op.licitacaoId);
    const { data, error } = await q;
    if (error) throw error;

    const lista = data ?? [];
    resultado.verificadas = lista.length;
    const agora = Date.now();
    const prazo = agora + PRAZO_DA_RODADA_MS;

    const aColetar: LicitacaoMonitorada[] = [];
    for (const lic of lista) {
      const decisao = decidir(lic, agora, op.forcar ?? false);
      if (decisao.acao === "coletar") aColetar.push(lic);
      if (decisao.acao === "encerrar") {
        await this.encerrar(lic, decisao.motivo, eventos);
        resultado.encerradas++;
      }
    }

    if (aColetar.length > 0) {
      const palavras = await this.palavrasPorEquipe([...new Set(aColetar.map((l) => l.equipe_id))]);
      const conectores = new Map<string, Promise<PortalConnector>>();

      await emParalelo(aColetar, SIMULTANEAS, async (lic) => {
        // Rodada longa demais: o que sobrou entra na próxima (chat_ultima_coleta não mudou).
        if (Date.now() > prazo) return;
        resultado.coletadas++;
        try {
          const novas = await this.coletar(lic, conectores, palavras, eventos);
          resultado.mensagens_novas += novas;
        } catch (e) {
          resultado.falhas++;
          await this.registrarFalha(lic, e, eventos);
        }
      });
    }

    const canais = [canalAlertasApp((evs) => this.gravarAlertas(evs)), ...(this.deps.canais ?? [])];
    await despachar(canais, eventos);
    resultado.alertas = eventos.length;
    return resultado;
  }

  /** Um connector por portal e por rodada; a autenticação acontece uma única vez. */
  private conector(cache: Map<string, Promise<PortalConnector>>, slug: string) {
    let p = cache.get(slug);
    if (!p) {
      p = (async () => {
        const c = resolverConnector(slug, this.deps.conectores);
        if (!c) throw new Error(`O portal "${slug}" ainda não tem conector disponível.`);
        await c.authenticate();
        return c;
      })();
      cache.set(slug, p);
    }
    return p;
  }

  private async coletar(
    lic: LicitacaoMonitorada,
    conectores: Map<string, Promise<PortalConnector>>,
    palavrasPorEquipe: Map<string, string[]>,
    eventos: AlertaEvento[],
  ): Promise<number> {
    const idExterno = lic.chat_id_externo ?? "";
    const connector = await this.conector(conectores, lic.chat_conector ?? "");

    const ultima = lic.chat_ultima_msg_em ? Date.parse(lic.chat_ultima_msg_em) : null;
    const brutas = await connector.getChatMessages(idExterno, {
      monitoringStartedAt: lic.created_at,
      since: ultima != null ? new Date(ultima - SOBREPOSICAO_MS).toISOString() : null,
    });
    const normalizadas = normalizarLote(idExterno, brutas);

    // upsert + ignoreDuplicates devolve só as linhas realmente inseridas: sem
    // ler todos os ids já gravados a cada rodada (a leitura crescia com o chat).
    const novas: Array<{ id: string; autor: string; mensagem: string }> = [];
    for (let i = 0; i < normalizadas.length; i += 200) {
      const lote = normalizadas.slice(i, i + 200);
      const { data, error } = await this.db
        .from("chat_mensagens")
        .upsert(
          lote.map((n) => ({
            licitacao_id: lic.id,
            equipe_id: lic.equipe_id,
            externo_id: n.external_message_id,
            autor: n.author,
            papel: n.author_type,
            origem: "portal",
            mensagem: n.message,
            enviada_em: n.message_timestamp,
          })),
          { onConflict: "licitacao_id,externo_id", ignoreDuplicates: true },
        )
        .select("id, autor, mensagem");
      if (error) throw error;
      novas.push(...(data ?? []));
    }

    const palavras = palavrasPorEquipe.get(lic.equipe_id) ?? [];
    let emitidos = 0;
    let excedentes = 0;
    for (const m of novas) {
      const achadas = combinarPalavras(m.mensagem, palavras);
      if (achadas.length === 0) continue;
      if (emitidos >= MAX_ALERTAS_POR_LICITACAO) {
        excedentes++;
        continue;
      }
      emitidos++;
      eventos.push({
        equipe_id: lic.equipe_id,
        licitacao_id: lic.id,
        tipo: "chat",
        titulo: `Chat ${lic.numero}: ${achadas.join(", ")}`,
        corpo: `${m.autor}: ${cortar(m.mensagem, 400)}`,
      });
    }
    if (excedentes > 0) {
      eventos.push({
        equipe_id: lic.equipe_id,
        licitacao_id: lic.id,
        tipo: "chat",
        titulo: `Chat ${lic.numero}`,
        corpo: `Mais ${excedentes} mensagem(ns) com palavras-chave nesta rodada — veja a aba Chat.`,
      });
    }

    const horarios = normalizadas.map((n) => Date.parse(n.message_timestamp));
    const maisRecente = Math.max(ultima ?? 0, ...horarios);
    const agoraIso = new Date().toISOString();
    const { error: erroUpdate } = await this.db
      .from("licitacoes")
      .update({
        chat_ultima_coleta: agoraIso,
        chat_ultima_msg_em: maisRecente > 0 ? new Date(maisRecente).toISOString() : null,
        chat_ultimo_erro: null,
        chat_erros_seguidos: 0,
        ...(novas.length > 0 ? { ultima_atualizacao: agoraIso } : {}),
      })
      .eq("id", lic.id);
    if (erroUpdate) throw erroUpdate;

    return novas.length;
  }

  private async registrarFalha(lic: LicitacaoMonitorada, e: unknown, eventos: AlertaEvento[]) {
    const mensagem = e instanceof Error ? e.message : String(e);
    console.error(`[monitoramento] ${lic.chat_conector} / ${lic.numero}:`, mensagem);
    const erros = (lic.chat_erros_seguidos ?? 0) + 1;
    await this.db
      .from("licitacoes")
      .update({
        chat_ultima_coleta: new Date().toISOString(),
        chat_ultimo_erro: cortar(mensagem, 500),
        chat_erros_seguidos: erros,
      })
      .eq("id", lic.id);
    // Avisa uma vez, na 3ª falha seguida; a partir daí o intervalo aumenta sozinho.
    if (erros === FALHAS_ATE_AVISAR) {
      eventos.push({
        equipe_id: lic.equipe_id,
        licitacao_id: lic.id,
        tipo: "sistema",
        titulo: `Monitoramento do chat com falha: ${lic.numero}`,
        corpo: `${cortar(mensagem, 300)} — confira o acesso ao portal ou acompanhe o chat manualmente.`,
      });
    }
  }

  private async encerrar(lic: LicitacaoMonitorada, motivo: string, eventos: AlertaEvento[]) {
    await this.db.from("licitacoes").update({ chat_monitorar: false, chat_status: "encerrado", chat_status_motivo: motivo }).eq("id", lic.id);
    eventos.push({
      equipe_id: lic.equipe_id,
      licitacao_id: lic.id,
      tipo: "sistema",
      titulo: `Monitoramento do chat encerrado: ${lic.numero}`,
      corpo: `Desligado automaticamente (${motivo}). Dá para religar na aba Chat.`,
    });
  }

  private async palavrasPorEquipe(equipes: string[]): Promise<Map<string, string[]>> {
    const mapa = new Map<string, string[]>();
    if (equipes.length === 0) return mapa;
    const { data } = await this.db
      .from("chat_palavras_chave")
      .select("equipe_id, palavra")
      .eq("ativo", true)
      .in("equipe_id", equipes);
    for (const p of data ?? []) {
      mapa.set(p.equipe_id, [...(mapa.get(p.equipe_id) ?? []), p.palavra]);
    }
    return mapa;
  }

  private async gravarAlertas(eventos: AlertaEvento[]) {
    const { error } = await this.db.from("alertas").insert(
      eventos.map((e) => ({
        equipe_id: e.equipe_id,
        licitacao_id: e.licitacao_id,
        tipo: e.tipo,
        titulo: e.titulo,
        mensagem: e.corpo,
      })),
    );
    if (error) throw error;
  }
}
