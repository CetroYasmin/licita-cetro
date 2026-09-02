import type { Auction, ChatMessage } from "@/types/monitoramento";

/**
 * Contrato único que todo portal deve implementar.
 *
 * Nenhuma regra específica de portal deve vazar para o MonitoringService:
 * tudo que é particular de um portal (autenticação, endpoints, formato bruto
 * das mensagens, WebSocket, paginação) vive dentro do seu connector.
 */
export interface PortalConnector {
  /** Slug do portal, igual ao registrado na tabela de portais. */
  readonly slug: string;

  /** Autentica a sessão do connector (no MockConnector é no-op). */
  authenticate(): Promise<void>;

  /** Lista licitações disponíveis no portal. */
  getAuctions(): Promise<Auction[]>;

  /**
   * Retorna as mensagens do chat da licitação.
   * `context.monitoringStartedAt` permite que connectors sem histórico
   * (ou simulados) saibam desde quando a licitação está sendo acompanhada.
   */
  getChatMessages(
    auctionId: string,
    context?: ChatFetchContext,
  ): Promise<ChatMessage[]>;

  /** Opcional: portais que permitem enviar mensagem pelo chat. */
  sendChatMessage?(auctionId: string, message: string): Promise<void>;
}

export type ChatFetchContext = {
  /** ISO 8601 — início do monitoramento. */
  monitoringStartedAt?: string | null;
  /** ISO 8601 — horário da última mensagem já persistida. */
  since?: string | null;
};

export type ConnectorFactory = (portal: {
  slug: string;
  base_url: string | null;
}) => PortalConnector;
