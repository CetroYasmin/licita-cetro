import { MockConnector } from "./MockConnector";
import { ComprasNetConnector } from "./ComprasNetConnector";
import type { Auction, ChatMessage } from "@/types/monitoramento";
import type { ChatFetchContext, ConnectorDeps, PortalConnector } from "./PortalConnector";

type Registro = {
  nome: string;
  /** Como preencher o identificador da compra para este portal. */
  ajuda: string;
  criar: (deps: ConnectorDeps) => PortalConnector;
};

/**
 * BLL Compras não tem API/sessão que o servidor possa consultar: as
 * mensagens chegam por push (userscript no navegador) via
 * `/api/public/hooks/bll-chat`, que grava direto em chat_mensagens. Esta
 * entrada existe só para `connectorExiste("bll")` validar o cadastro — o
 * ciclo de coleta do MonitoringService pula licitações com esse conector
 * antes de chegar a chamar getChatMessages.
 */
class BLLConnector implements PortalConnector {
  readonly slug = "bll";
  async authenticate(): Promise<void> {
    // Sem sessão própria: a autenticação acontece no navegador de quem tem o
    // Tampermonkey instalado, fora do alcance do servidor.
  }
  async getAuctions(): Promise<Auction[]> {
    return [];
  }
  async getChatMessages(_auctionId: string, _context?: ChatFetchContext): Promise<ChatMessage[]> {
    // Nunca deveria ser chamado — MonitoringService pula "bll" antes disso.
    throw new Error(
      "BLL Compras não é consultado pelo servidor: as mensagens chegam pelo userscript no navegador.",
    );
  }
}

/**
 * Registro de connectors. Para adicionar um portal real, basta implementar
 * PortalConnector e registrar o slug aqui — nenhuma outra camada muda.
 */
const REGISTRO: Record<string, Registro> = {
  comprasnet: {
    nome: "Compras.gov.br",
    ajuda:
      "UASG-modalidade-número-ano, ex.: 981547-5-118-2026 (a UASG é obrigatória — o mesmo número de compra se repete em órgãos diferentes).",
    criar: (deps) => new ComprasNetConnector(undefined, deps),
  },
  bll: {
    nome: "BLL Compras",
    ajuda:
      "Número/ano da licitação no BLL, ex.: 10.015/2026. Não use UASG. As mensagens chegam automaticamente enquanto o chat estiver aberto no navegador com o Tampermonkey instalado.",
    criar: () => new BLLConnector(),
  },
  mock: {
    nome: "Demonstração (mensagens simuladas)",
    ajuda: "Qualquer texto — gera mensagens de teste.",
    criar: () => new MockConnector(),
  },
  // licitanet, bbmnet, portal-de-compras-publicas, licitacoes-e, pe-integrado...
};

export function resolverConnector(slug: string, deps: ConnectorDeps = {}): PortalConnector | null {
  const item = REGISTRO[slug];
  return item ? item.criar(deps) : null;
}

export function connectorsDisponiveis(): Array<{ slug: string; nome: string; ajuda: string }> {
  return Object.entries(REGISTRO).map(([slug, r]) => ({ slug, nome: r.nome, ajuda: r.ajuda }));
}

export function connectorExiste(slug: string): boolean {
  return slug in REGISTRO;
}

export type { PortalConnector } from "./PortalConnector";
