import { MockConnector } from "./MockConnector";
import { ComprasNetConnector } from "./ComprasNetConnector";
import type { ConnectorDeps, PortalConnector } from "./PortalConnector";

type Registro = {
  nome: string;
  /** Como preencher o identificador da compra para este portal. */
  ajuda: string;
  criar: (deps: ConnectorDeps) => PortalConnector;
};

/**
 * Registro de connectors. Para adicionar um portal real, basta implementar
 * PortalConnector e registrar o slug aqui — nenhuma outra camada muda.
 */
const REGISTRO: Record<string, Registro> = {
  comprasnet: {
    nome: "Compras.gov.br",
    ajuda: "Número/ano (118/2026) ou UASG-modalidade-número-ano (981547-5-118-2026).",
    criar: (deps) => new ComprasNetConnector(undefined, deps),
  },
  mock: {
    nome: "Demonstração (mensagens simuladas)",
    ajuda: "Qualquer texto — gera mensagens de teste.",
    criar: () => new MockConnector(),
  },
  // bll: { nome: "BLL Compras", ajuda: "...", criar: (deps) => new BLLConnector(deps) },
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
