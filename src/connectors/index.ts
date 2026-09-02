import { MockConnector } from "./MockConnector";
import type { PortalConnector } from "./PortalConnector";

/**
 * Registro de connectors. Para adicionar um portal real, basta implementar
 * PortalConnector e registrar o connector_type aqui — nenhuma outra camada
 * do sistema muda.
 */
const REGISTRO: Record<string, () => PortalConnector> = {
  mock: () => new MockConnector(),
  // comprasnet: () => new ComprasNetConnector(...),
  // bll: () => new BLLConnector(...),
  // licitacoes-e: () => new LicitacoesEConnector(...),
  // portal-compras-publicas: () => new PortalComprasPublicasConnector(...),
};

export function resolverConnector(connectorType: string): PortalConnector | null {
  const factory = REGISTRO[connectorType];
  return factory ? factory() : null;
}

export function connectorsDisponiveis(): string[] {
  return Object.keys(REGISTRO);
}

export type { PortalConnector } from "./PortalConnector";
