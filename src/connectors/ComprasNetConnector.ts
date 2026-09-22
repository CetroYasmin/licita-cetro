import type { ChatFetchContext, ConnectorDeps, PortalConnector } from "./PortalConnector";
import type { Auction, AutorTipo, ChatMessage } from "@/types/monitoramento";

/**
 * Conector do Compras.gov.br (ComprasNet / cnetmobile).
 *
 * O chat da sessão fica atrás de autenticação: o endpoint
 * `/comprasnet-mensagem/v1/mensagens` responde 401/403 sem um token válido.
 * O portal usa SSO gov.br (captcha/2FA), então não há login por usuário e
 * senha — o que existe é o token de sessão do fornecedor, capturado à mão do
 * navegador (DevTools → Network → header Authorization) e colado no segredo.
 *
 * Não há renovação automática confirmada: uma tentativa de endpoint de
 * "retoken" foi removida porque rejeitava tokens válidos (provável rota
 * incorreta ou exigência de contexto de navegador que não temos como
 * reproduzir do servidor). A validade é decidida pela própria chamada de
 * mensagens: 401/403 nela é que significa token vencido de verdade.
 *
 * Credenciais (segredos do servidor, nunca no navegador):
 * - COMPRASNET_API_TOKEN  → token de sessão do fornecedor (JWT), capturado do
 *   navegador. Vence em algumas horas; quando expirar, capture outro e troque
 *   o valor do segredo — é o único "reset" que existe hoje.
 * - COMPRASNET_CNPJ       → identificadorParticipante (CNPJ, só dígitos).
 * - COMPRASNET_BASE_URL   → opcional, padrão https://cnetmobile.estaleiro.serpro.gov.br
 */

const BASE_PADRAO = "https://cnetmobile.estaleiro.serpro.gov.br";

/** tipoRemetente do ComprasNet → papel do autor no nosso modelo. */
export function papelCompras(tipoRemetente: unknown): AutorTipo {
  const t = String(tipoRemetente ?? "").trim();
  if (t === "3") return "pregoeiro";
  if (t === "0" || t === "1") return "sistema";
  return "licitante";
}

export function autorCompras(papel: AutorTipo, bruta: Record<string, unknown>): string {
  if (papel === "pregoeiro") return "Pregoeiro";
  if (papel === "sistema") return "Sistema";
  const id = bruta["identificadorRemetente"] ?? bruta["cnpjRemetente"];
  return id ? `Licitante ${id}` : "Licitante";
}

/** "2026-09-01 11:19:10.361" chega em horário de Brasília. */
export function dataCompras(valor: unknown): string {
  const texto = String(valor ?? "").trim();
  if (!texto) return new Date().toISOString();
  const direto = new Date(texto);
  if (texto.includes("T") && !Number.isNaN(direto.getTime())) return direto.toISOString();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?/.exec(texto);
  if (m) {
    const iso = new Date(
      `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}.${(m[7] ?? "0").padEnd(3, "0")}-03:00`,
    );
    if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  }
  return Number.isNaN(direto.getTime()) ? new Date().toISOString() : direto.toISOString();
}

/**
 * Identificação da compra aceita em `external_id`:
 *  - "118/2026"                → número/ano
 *  - "981547-3-118-2026"       → uasg-modalidade-numero-ano
 *  - "98154700031182026"       → concatenado do portal
 */
export function partesDaCompra(externalId: string) {
  const limpo = externalId.trim();
  const barra = /^(\d{1,6})\s*\/\s*(\d{4})$/.exec(limpo);
  if (barra)
    return { numero: Number(barra[1]), ano: Number(barra[2]), uasg: null, modalidade: null };

  const tracos = limpo.split(/[-_.]/).filter(Boolean);
  if (tracos.length === 4 && tracos.every((t) => /^\d+$/.test(t))) {
    return {
      uasg: Number(tracos[0]),
      modalidade: Number(tracos[1]),
      numero: Number(tracos[2]),
      ano: Number(tracos[3]),
    };
  }

  const concat = /^(\d{6})(\d{2})(\d{5})(\d{4})$/.exec(limpo.replace(/\D/g, ""));
  if (concat) {
    return {
      uasg: Number(concat[1]),
      modalidade: Number(concat[2]),
      numero: Number(concat[3]),
      ano: Number(concat[4]),
    };
  }
  return { numero: null, ano: null, uasg: null, modalidade: null };
}

type Bruta = Record<string, any>;

export class ComprasNetConnector implements PortalConnector {
  readonly slug = "comprasnet";

  private token: string | null = null;
  private autenticado = false;
  /** A API devolve as mensagens do participante inteiro; uma consulta atende todas as compras da rodada. */
  private lista: { em: number; dados: Bruta[] } | null = null;
  private static readonly VALIDADE_LISTA = 15_000;

  constructor(
    private readonly baseUrl: string = BASE_PADRAO,
    private readonly deps: ConnectorDeps = {},
  ) {}

  private get cnpj(): string | null {
    const v = process.env["COMPRASNET_CNPJ"];
    return v ? v.replace(/\D/g, "") : null;
  }

  /**
   * Escolhe um token: o segredo (o que você acabou de colar) tem prioridade
   * sobre qualquer sessão guardada de uma tentativa anterior, porque é o
   * valor mais recente que você forneceu. Não há chamada de verificação
   * aqui — a validade real só é conhecida na primeira chamada de mensagens
   * (ver `carregarLista`), que responde 401/403 se o token estiver vencido.
   */
  async authenticate(): Promise<void> {
    if (this.autenticado && this.token) return;

    const doSegredo = process.env["COMPRASNET_API_TOKEN"]?.trim() || null;
    const guardado = doSegredo
      ? null
      : ((await this.deps.sessoes?.carregar(this.slug).catch(() => null)) ?? null);
    const token = doSegredo ?? guardado;

    if (!token) {
      throw new Error(
        "Compras.gov.br: credencial ausente. Cadastre o segredo COMPRASNET_API_TOKEN com o token de sessão do fornecedor.",
      );
    }
    this.token = token;
    this.autenticado = true;
  }

  /** O portal não expõe lista de licitações do fornecedor sem contexto; o cadastro vem da pesquisa. */
  async getAuctions(): Promise<Auction[]> {
    return [];
  }

  async getChatMessages(auctionId: string, context?: ChatFetchContext): Promise<ChatMessage[]> {
    await this.authenticate();
    const alvo = partesDaCompra(auctionId);
    const lista = await this.carregarLista();
    const desde = context?.since ? new Date(context.since).getTime() : null;

    return lista
      .filter((b) => this.mesmaCompra(b, alvo))
      .map((b) => this.normalizar(b))
      .filter((m) => (desde == null ? true : new Date(m.message_timestamp).getTime() > desde));
  }

  /** Uma chamada HTTP por rodada, não uma por licitação monitorada. */
  private async carregarLista(): Promise<Bruta[]> {
    if (this.lista && Date.now() - this.lista.em < ComprasNetConnector.VALIDADE_LISTA) {
      return this.lista.dados;
    }

    const params = new URLSearchParams({
      size: "200",
      page: "0",
      incluirMensagensCompra: "false",
    });
    if (this.cnpj) params.set("identificadorParticipante", this.cnpj);

    const url = `${this.baseUrl}/comprasnet-mensagem/v1/mensagens?${params.toString()}`;
    const r = await fetch(url, { headers: this.cabecalhos(), signal: AbortSignal.timeout(15000) });

    if (r.status === 401 || r.status === 403) {
      this.autenticado = false;
      throw new Error(
        "Compras.gov.br: token de sessão expirado ou sem permissão. Atualize o segredo COMPRASNET_API_TOKEN.",
      );
    }
    if (!r.ok) {
      throw new Error(`Compras.gov.br respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
    }

    const corpo = (await r.json().catch(() => null)) as unknown;
    const dados: Bruta[] = Array.isArray(corpo)
      ? (corpo as Bruta[])
      : Array.isArray((corpo as Bruta)?.["content"])
        ? ((corpo as Bruta)["content"] as Bruta[])
        : Array.isArray((corpo as Bruta)?.["mensagens"])
          ? ((corpo as Bruta)["mensagens"] as Bruta[])
          : [];

    this.lista = { em: Date.now(), dados };
    return dados;
  }

  private mesmaCompra(bruta: Bruta, alvo: ReturnType<typeof partesDaCompra>): boolean {
    if (alvo.numero == null || alvo.ano == null) return true;
    const chave = bruta["chaveCompra"] as Bruta | undefined;
    if (!chave) return true;
    if (Number(chave["numero"]) !== alvo.numero || Number(chave["ano"]) !== alvo.ano) return false;
    if (alvo.uasg != null) {
      const uasg = Number(chave["numeroUasg"] ?? chave["idUasgIdentificacao"]);
      if (Number.isFinite(uasg) && uasg !== alvo.uasg) return false;
    }
    return true;
  }

  private normalizar(bruta: Bruta): ChatMessage {
    const papel = papelCompras(bruta["tipoRemetente"]);
    const item = bruta["identificadorItem"];
    const texto = String(bruta["texto"] ?? bruta["mensagem"] ?? "").trim();
    return {
      external_message_id: bruta["chaveMensagemNaOrigem"]
        ? String(bruta["chaveMensagemNaOrigem"])
        : null,
      author: autorCompras(papel, bruta),
      author_type: papel,
      message: item ? `[Item ${item}] ${texto}` : texto,
      message_timestamp: dataCompras(bruta["dataHora"] ?? bruta["dataHoraMensagem"]),
    };
  }

  private cabecalhos(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "pt-BR,pt;q=0.9",
      // Sem Content-Type: são requisições GET, sem corpo; declarar json aqui
      // não ajuda e é um sinal a mais de tráfego não-navegador para um WAF.
      // User-Agent de navegador real: identificar como robô é o tipo de coisa
      // que um filtro anti-automação rejeita antes mesmo de olhar o token.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    };
  }
}
