import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { resolverConnector } from "@/connectors";
import { normalizarLote } from "./normalizer";
import { combinarPalavras } from "./keywords";
import { canalInApp, despachar, type NotificacaoEvento } from "@/services/notifications/notifier";

type DB = SupabaseClient<Database>;

export type ResultadoSync = {
  pregoes_processados: number;
  mensagens_novas: number;
  notificacoes: number;
};

/**
 * Orquestra o ciclo de monitoramento. Não conhece nenhum portal específico:
 * pede as mensagens ao connector, normaliza, persiste só o que é novo,
 * aplica o motor de palavras-chave e despacha notificações.
 */
export class MonitoringService {
  constructor(
    private readonly db: DB,
    private readonly userId: string,
    private readonly equipeId: string | null,
  ) {}

  async sincronizar(pregaoId?: string): Promise<ResultadoSync> {
    const resultado: ResultadoSync = {
      pregoes_processados: 0,
      mensagens_novas: 0,
      notificacoes: 0,
    };

    let q = this.db
      .from("monitoramentos")
      .select("id, pregao_id, created_at, ativo, pregoes(id, external_id, titulo, portal_id, portais(slug, connector_type, base_url, ativo))")
      .eq("user_id", this.userId)
      .eq("ativo", true);
    if (pregaoId) q = q.eq("pregao_id", pregaoId);

    const { data: monitoramentos, error } = await q;
    if (error) throw error;

    const palavras = await this.palavrasAtivas();
    const eventos: NotificacaoEvento[] = [];

    for (const m of monitoramentos ?? []) {
      const pregao = (m as any).pregoes;
      const portal = pregao?.portais;
      if (!pregao || !portal?.ativo) continue;

      const connector = resolverConnector(portal.connector_type);
      if (!connector) continue;

      resultado.pregoes_processados++;

      // Falha de um portal (token expirado, indisponibilidade) não derruba os outros.
      let brutas;
      try {
        await connector.authenticate();
        brutas = await connector.getChatMessages(pregao.external_id, {
          monitoringStartedAt: (m as any).created_at,
        });
      } catch (e) {
        console.error(`[monitoramento] ${portal.slug}:`, e instanceof Error ? e.message : e);
        continue;
      }

      const normalizadas = normalizarLote(pregao.external_id, brutas);
      if (normalizadas.length === 0) continue;


      const existentes = await this.idsExistentes(pregao.id);
      const novas = normalizadas.filter((n) => !existentes.has(n.external_message_id));
      if (novas.length === 0) continue;

      const { data: inseridas, error: erroInsert } = await this.db
        .from("pregao_mensagens")
        .insert(
          novas.map((n) => ({
            equipe_id: this.equipeId,
            pregao_id: pregao.id,
            portal_id: pregao.portal_id,
            external_message_id: n.external_message_id,
            autor: n.author,
            autor_tipo: n.author_type,
            mensagem: n.message,
            mensagem_em: n.message_timestamp,
          })),
        )
        .select("id, mensagem");
      if (erroInsert) {
        // Corrida entre dois workers: a restrição de unicidade já protege.
        if (erroInsert.code !== "23505") throw erroInsert;
        continue;
      }

      resultado.mensagens_novas += inseridas?.length ?? 0;

      for (const msg of inseridas ?? []) {
        const encontradas = combinarPalavras(msg.mensagem, palavras);
        if (encontradas.length === 0) continue;
        eventos.push({
          user_id: this.userId,
          pregao_id: pregao.id,
          mensagem_id: msg.id,
          tipo: "palavra_chave",
          palavra: encontradas.join(", "),
          titulo: `Palavra-chave em ${pregao.titulo}`,
          corpo: msg.mensagem,
        });
      }
    }

    await despachar([canalInApp((evs) => this.persistirNotificacoes(evs))], eventos);
    resultado.notificacoes = eventos.length;
    return resultado;
  }

  private async palavrasAtivas(): Promise<string[]> {
    const { data } = await this.db
      .from("palavras_chave")
      .select("palavra")
      .eq("user_id", this.userId)
      .eq("ativo", true);
    return (data ?? []).map((p) => p.palavra);
  }

  private async idsExistentes(pregaoId: string): Promise<Set<string>> {
    const { data } = await this.db
      .from("pregao_mensagens")
      .select("external_message_id")
      .eq("pregao_id", pregaoId);
    return new Set((data ?? []).map((m) => m.external_message_id));
  }

  private async persistirNotificacoes(eventos: NotificacaoEvento[]) {
    const { error } = await this.db.from("notificacoes").insert(
      eventos.map((e) => ({
        user_id: e.user_id,
        pregao_id: e.pregao_id,
        mensagem_id: e.mensagem_id,
        tipo: e.tipo,
        palavra: e.palavra,
        titulo: e.titulo,
        corpo: e.corpo,
      })),
    );
    if (error) throw error;
  }
}
