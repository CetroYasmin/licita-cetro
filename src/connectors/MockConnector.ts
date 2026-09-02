import type { ChatFetchContext, PortalConnector } from "./PortalConnector";
import type { Auction, ChatMessage } from "@/types/monitoramento";

/**
 * Portal simulado. Gera mensagens de forma determinística a partir do início
 * do monitoramento, para que qualquer worker (stateless) chegue sempre ao
 * mesmo conjunto de mensagens "já publicadas" naquele instante.
 */

type Roteiro = { offset: number; autor: string; tipo: ChatMessage["author_type"]; texto: string };

/** Segundos após o início do monitoramento em que cada mensagem é publicada. */
const ROTEIRO: Roteiro[] = [
  { offset: 0, autor: "Sistema", tipo: "sistema", texto: "Sessão pública aberta pelo pregoeiro." },
  { offset: 8, autor: "Pregoeiro", tipo: "pregoeiro", texto: "Bom dia, senhores licitantes." },
  { offset: 20, autor: "Pregoeiro", tipo: "pregoeiro", texto: "Iniciaremos a fase de lances." },
  { offset: 32, autor: "Sistema", tipo: "sistema", texto: "Item 1 aberto para lances." },
  { offset: 44, autor: "Licitante 21.181.254/0001-23", tipo: "licitante", texto: "Lance registrado para o item 1." },
  { offset: 58, autor: "Pregoeiro", tipo: "pregoeiro", texto: "Encerrada a fase de lances do item 1." },
  { offset: 70, autor: "Pregoeiro", tipo: "pregoeiro", texto: "Empresa vencedora, favor enviar documentação de habilitação." },
  { offset: 84, autor: "Sistema", tipo: "sistema", texto: "Convocação para envio de anexos aberta para o item 1." },
  { offset: 98, autor: "Licitante 21.181.254/0001-23", tipo: "licitante", texto: "Documentação enviada conforme solicitado." },
  { offset: 112, autor: "Pregoeiro", tipo: "pregoeiro", texto: "Aguardamos manifestação quanto ao recurso." },
  { offset: 126, autor: "Licitante 09.412.777/0001-88", tipo: "licitante", texto: "Manifestamos intenção de recurso." },
  { offset: 140, autor: "Pregoeiro", tipo: "pregoeiro", texto: "Prazo para contrarrazões aberto por 3 dias úteis." },
];

/** Mensagens cíclicas depois do roteiro, para a sessão seguir viva. */
const CICLO: Roteiro[] = [
  { offset: 0, autor: "Pregoeiro", tipo: "pregoeiro", texto: "Seguimos com a análise da proposta apresentada." },
  { offset: 16, autor: "Sistema", tipo: "sistema", texto: "Nova convocação para envio de amostra registrada." },
  { offset: 32, autor: "Licitante 21.181.254/0001-23", tipo: "licitante", texto: "Ciente, providenciaremos a amostra." },
  { offset: 48, autor: "Pregoeiro", tipo: "pregoeiro", texto: "Sessão suspensa e será retomada em breve." },
];

const CICLO_DURACAO = 60;

const DEMO_AUCTIONS: Auction[] = [
  {
    external_id: "DEMO-123-2026",
    title: "Pregão Eletrônico 123/2026",
    agency: "Prefeitura Municipal de Exemplo",
    objeto: "Contratação de empresa para execução de obras de engenharia civil",
    status: "em_disputa",
  },
  {
    external_id: "DEMO-451-2026",
    title: "Pregão Eletrônico 451/2026",
    agency: "Secretaria Estadual de Saúde",
    objeto: "Aquisição de materiais médico-hospitalares",
    status: "aberta",
  },
];

export class MockConnector implements PortalConnector {
  readonly slug = "mock";

  async authenticate(): Promise<void> {
    // Portal simulado: nada a autenticar.
  }

  async getAuctions(): Promise<Auction[]> {
    return DEMO_AUCTIONS;
  }

  async getChatMessages(auctionId: string, context?: ChatFetchContext): Promise<ChatMessage[]> {
    const inicio = context?.monitoringStartedAt
      ? new Date(context.monitoringStartedAt).getTime()
      : Date.now();
    if (Number.isNaN(inicio)) return [];

    const agora = Date.now();
    const decorrido = Math.floor((agora - inicio) / 1000);
    if (decorrido < 0) return [];

    const mensagens: ChatMessage[] = [];

    for (const [i, item] of ROTEIRO.entries()) {
      if (item.offset > decorrido) break;
      mensagens.push(paraMensagem(auctionId, `roteiro-${i}`, inicio, item.offset, item));
    }

    const fimRoteiro = ROTEIRO[ROTEIRO.length - 1]?.offset ?? 0;
    if (decorrido > fimRoteiro) {
      const voltas = Math.floor((decorrido - fimRoteiro) / CICLO_DURACAO) + 1;
      for (let volta = 0; volta < voltas; volta++) {
        for (const [i, item] of CICLO.entries()) {
          const offset = fimRoteiro + volta * CICLO_DURACAO + item.offset;
          if (offset > decorrido) continue;
          mensagens.push(paraMensagem(auctionId, `ciclo-${volta}-${i}`, inicio, offset, item));
        }
      }
    }

    const desde = context?.since ? new Date(context.since).getTime() : null;
    return desde == null
      ? mensagens
      : mensagens.filter((m) => new Date(m.message_timestamp).getTime() > desde);
  }
}

function paraMensagem(
  auctionId: string,
  sufixo: string,
  inicio: number,
  offset: number,
  item: Roteiro,
): ChatMessage {
  return {
    external_message_id: `mock:${auctionId}:${sufixo}`,
    author: item.autor,
    author_type: item.tipo,
    message: item.texto,
    message_timestamp: new Date(inicio + offset * 1000).toISOString(),
  };
}
