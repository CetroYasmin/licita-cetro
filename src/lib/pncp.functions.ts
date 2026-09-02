import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { relevancia } from "@/lib/busca";

const BASE = "https://pncp.gov.br/api/consulta/v1";

/**
 * O PNCP rejeita (503/502) chamadas sem identificação de navegador.
 * Todas as consultas precisam destes cabeçalhos.
 */
const CABECALHOS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
} as const;

const MODALIDADE_CODIGOS: Record<string, number> = {
  "Pregão Eletrônico": 6,
  "Pregão Presencial": 7,
  "Concorrência Eletrônica": 4,
  "Concorrência Presencial": 5,
  "Dispensa de Licitação": 8,
  Inexigibilidade: 9,
  Concurso: 3,
  Credenciamento: 12,
  "Pré-qualificação": 11,
  Leilão: 1,
};

/** Modalidades consultadas quando o usuário não escolhe uma, em ordem de volume. */
const MODALIDADES_PADRAO = [6, 8, 4];
/** Varredura total: cobre também as modalidades menos frequentes. */
const MODALIDADES_TOTAIS = [6, 8, 4, 9, 7, 5, 12, 13, 11, 3, 1, 2];

const PADRAO_OBRAS =
  /(obra|obras|constru|reforma|pavimenta|engenharia|edifica|drenagem|saneamento|terraplan|recapea|ampliação|reformas|infraestrutura|ponte|calçamen|urbaniza|revitaliza)/i;
const PADRAO_TI = /(software|sistema|licença|licenca|tecnologia da informação|computador|notebook|servidor|link de internet|nuvem)/i;
const PADRAO_SERVICO = /(serviço|servicos|serviços|prestação|manutenção|locação de mão|mão de obra|limpeza|vigilância|transporte|consultoria)/i;
const PADRAO_COMPRA = /(aquisição|aquisicao|compra|fornecimento|material|materiais|equipament|gênero|medicament|combustível)/i;

export function classificarNatureza(objeto: string): string {
  if (PADRAO_OBRAS.test(objeto)) return "Obras e engenharia";
  if (PADRAO_TI.test(objeto)) return "Serviços de TI";
  if (PADRAO_SERVICO.test(objeto)) return "Serviços";
  if (PADRAO_COMPRA.test(objeto)) return "Compras/materiais";
  return "Outros";
}

const yyyymmdd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

export type LicitacaoPncp = {
  fonte_id: string;
  numero: string;
  modalidade: string;
  orgao: string;
  orgao_cnpj: string;
  objeto: string;
  natureza: string;
  data_publicacao: string | null;
  data_abertura: string | null;
  data_sessao: string | null;
  encerramento_proposta: string | null;
  plataforma: string;
  portal: string;
  site_url: string | null;
  processo_administrativo: string | null;
  valor_estimado: number | null;
  cidade: string | null;
  uf: string | null;
  situacao: string | null;
  ano: number;
  sequencial: number;
  relevancia: number;
};

/** Portais/sistemas de origem reconhecidos (usado também como filtro na pesquisa). */
export const PORTAIS = [
  "Compras.gov.br (ComprasNet)",
  "Licitações-e (Banco do Brasil)",
  "BLL Compras",
  "BNC — Bolsa Nacional de Compras",
  "BBMNET Licitações",
  "Portal de Compras Públicas",
  "Licitanet",
  "Licitar Digital",
  "Gestão de Compras (M2A Tecnologia)",
  "S2GPR (Governo do Ceará)",
  "BEC/SP",
  "Compras RS",
  "Central de Compras PB",
  "ComprasBR",
  "Publinexo",
  "Effecti",
  "Compras Públicas (outros)",
  "PNCP",
  "Não informado",
] as const;

function nomePortal(link?: string | null): string {
  if (!link) return "Não informado";
  const l = link.toLowerCase();
  if (l.includes("comprasnet") || l.includes("gov.br/compras") || l.includes("cnetmobile") || l.includes("compras.gov.br"))
    return "Compras.gov.br (ComprasNet)";
  if (l.includes("licitacoes-e") || l.includes("licitacoes-e.com.br") || l.includes("bb.com.br"))
    return "Licitações-e (Banco do Brasil)";
  if (l.includes("bllcompras") || l.includes("bll.org.br") || l.includes("bllcompras.com")) return "BLL Compras";
  if (l.includes("bnc.org.br") || l.includes("bncompras") || /\bbnc\b/.test(l)) return "BNC — Bolsa Nacional de Compras";
  if (l.includes("bbmnet") || l.includes("bbmnetlicitacoes")) return "BBMNET Licitações";
  if (l.includes("portaldecompraspublicas")) return "Portal de Compras Públicas";
  if (l.includes("licitanet")) return "Licitanet";
  if (l.includes("licitardigital")) return "Licitar Digital";
  if (l.includes("m2atecnologia") || l.includes("gestaodecompras") || l.includes("gestao-de-compras"))
    return "Gestão de Compras (M2A Tecnologia)";
  if (l.includes("s2gpr") || l.includes("seplag.ce.gov.br") || l.includes("licitacoes.ce.gov.br"))
    return "S2GPR (Governo do Ceará)";
  if (l.includes("bec.sp.gov.br")) return "BEC/SP";
  if (l.includes("compras.rs") || l.includes("cel.rs")) return "Compras RS";
  if (l.includes("centraldecompras.pb.gov.br")) return "Central de Compras PB";
  if (l.includes("comprasbr")) return "ComprasBR";
  if (l.includes("publinexo")) return "Publinexo";
  if (l.includes("effecti")) return "Effecti";
  if (l.includes("pncp.gov.br")) return "PNCP";
  try {
    return `${new URL(link.startsWith("http") ? link : `https://${link}`).hostname.replace("www.", "")}`;
  } catch {
    return "Não informado";
  }
}

function mapear(c: any): LicitacaoPncp {
  const objeto = String(c.objetoCompra ?? "");
  const orgaoUnidade = c.unidadeOrgao ?? {};
  return {
    fonte_id: String(
      c.numeroControlePNCP ?? `${c.orgaoEntidade?.cnpj}-${c.anoCompra}-${c.sequencialCompra}`,
    ),
    numero: String(c.numeroCompra ?? c.numeroControlePNCP ?? "—"),
    modalidade: String(c.modalidadeNome ?? "—"),
    orgao: String(c.orgaoEntidade?.razaoSocial ?? orgaoUnidade.nomeUnidade ?? "—"),
    orgao_cnpj: String(c.orgaoEntidade?.cnpj ?? ""),
    objeto,
    natureza: classificarNatureza(objeto),
    data_publicacao: c.dataPublicacaoPncp ?? null,
    data_abertura: c.dataAberturaProposta ?? null,
    data_sessao: c.dataAberturaProposta ?? null,
    encerramento_proposta: c.dataEncerramentoProposta ?? null,
    plataforma: String(c.modoDisputaNome ?? "—"),
    portal: nomePortal(c.linkSistemaOrigem),
    site_url: c.linkSistemaOrigem ?? null,
    processo_administrativo: c.processo ?? null,
    valor_estimado: c.valorTotalEstimado != null ? Number(c.valorTotalEstimado) : null,
    cidade: orgaoUnidade.municipioNome ?? null,
    uf: orgaoUnidade.ufSigla ?? null,
    situacao: c.situacaoCompraNome ?? null,
    ano: Number(c.anoCompra ?? new Date().getFullYear()),
    sequencial: Number(c.sequencialCompra ?? 0),
    relevancia: 0,
  };
}

/** Cache curto por consulta: evita repetir chamadas e estourar o limite do PNCP. */
const cache = new Map<string, { em: number; valor: { lista: any[]; totalPaginas: number } }>();
const VALIDADE_CACHE = 5 * 60 * 1000;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * O PNCP limita requisições por minuto e responde 429/502/503 quando a
 * varredura é agressiva. Por isso cada chamada tem tempo limite, novas
 * tentativas com espera crescente e resultado em cache.
 */
async function buscarPagina(
  caminho: string,
  params: URLSearchParams,
): Promise<{ lista: any[]; totalPaginas: number } | null> {
  const alvo = `${BASE}${caminho}?${params.toString()}`;
  const emCache = cache.get(alvo);
  if (emCache && Date.now() - emCache.em < VALIDADE_CACHE) return emCache.valor;

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const res = await fetch(alvo, { headers: CABECALHOS, signal: AbortSignal.timeout(12000) });
      if (res.status === 204) return { lista: [], totalPaginas: 0 };
      if (res.status === 429 || res.status >= 500) {
        await espera(900 * (tentativa + 1));
        continue;
      }
      if (!res.ok) return null;
      const payload = (await res.json()) as { data?: unknown[]; totalPaginas?: number };
      const valor = {
        lista: (payload?.data ?? []) as any[],
        totalPaginas: Number(payload?.totalPaginas ?? 1),
      };
      cache.set(alvo, { em: Date.now(), valor });
      return valor;
    } catch {
      await espera(500 * (tentativa + 1));
    }
  }
  return null;
}


const ORDENACOES = {
  relevancia: (a: LicitacaoPncp, b: LicitacaoPncp) => b.relevancia - a.relevancia,
  sessao: (a: LicitacaoPncp, b: LicitacaoPncp) =>
    (a.data_abertura ?? "9999").localeCompare(b.data_abertura ?? "9999"),
  publicacao: (a: LicitacaoPncp, b: LicitacaoPncp) =>
    (b.data_publicacao ?? "").localeCompare(a.data_publicacao ?? ""),
  encerramento: (a: LicitacaoPncp, b: LicitacaoPncp) =>
    (a.encerramento_proposta ?? "9999").localeCompare(b.encerramento_proposta ?? "9999"),
  valor_desc: (a: LicitacaoPncp, b: LicitacaoPncp) => (b.valor_estimado ?? 0) - (a.valor_estimado ?? 0),
  valor_asc: (a: LicitacaoPncp, b: LicitacaoPncp) => (a.valor_estimado ?? 0) - (b.valor_estimado ?? 0),
  orgao: (a: LicitacaoPncp, b: LicitacaoPncp) => a.orgao.localeCompare(b.orgao, "pt-BR"),
  uf: (a: LicitacaoPncp, b: LicitacaoPncp) => (a.uf ?? "").localeCompare(b.uf ?? ""),
} as const;

export type Ordenacao = keyof typeof ORDENACOES;

export const buscarLicitacoesPncp = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        objeto: z.string().optional().default(""),
        ufs: z.array(z.string()).optional().default([]),
        modalidade: z.string().optional().default(""),
        natureza: z.string().optional().default(""),
        portal: z.string().optional().default(""),
        valorMinimo: z.number().optional(),
        valorMaximo: z.number().optional(),
        incluirEncerradas: z.boolean().optional().default(false),
        profundidade: z.string().optional().default("ampla"),
        ordenar: z.string().optional().default("relevancia"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const codigos = data.modalidade
      ? [MODALIDADE_CODIGOS[data.modalidade] ?? 6]
      : data.profundidade === "total"
        ? MODALIDADES_TOTAIS
        : data.profundidade === "rapida"
          ? [6]
          : MODALIDADES_PADRAO;

    const maxPaginasPorConsulta =
      data.profundidade === "rapida" ? 3 : data.profundidade === "total" ? 12 : 6;
    const limiteRequisicoes = data.profundidade === "rapida" ? 20 : data.profundidade === "total" ? 120 : 60;

    const dataFinal = yyyymmdd(new Date(Date.now() + 1000 * 60 * 60 * 24 * 365));
    const hoje = yyyymmdd(new Date());
    const dataInicial = yyyymmdd(new Date(Date.now() - 1000 * 60 * 60 * 24 * 90));

    const erros: string[] = [];
    const encontradas = new Map<string, LicitacaoPncp>();
    let requisicoes = 0;

    // Quando o usuário escolhe estados, consultamos cada UF (o PNCP filtra por uma UF por chamada).
    const ufs = data.ufs.length > 0 ? data.ufs : [""];

    const consultas: Array<{ caminho: string; base: URLSearchParams }> = [];
    for (const codigo of codigos) {
      for (const uf of ufs) {
        const base = new URLSearchParams({
          dataFinal,
          codigoModalidadeContratacao: String(codigo),
          tamanhoPagina: "50",
        });
        if (uf) base.set("uf", uf);
        consultas.push({ caminho: "/contratacoes/proposta", base });

        if (data.incluirEncerradas) {
          const pub = new URLSearchParams({
            dataInicial,
            dataFinal: hoje,
            codigoModalidadeContratacao: String(codigo),
            tamanhoPagina: "50",
          });
          if (uf) pub.set("uf", uf);
          consultas.push({ caminho: "/contratacoes/publicacao", base: pub });
        }
      }
    }

    const registrar = (bruto: any) => {
      const l = mapear(bruto);
      const texto = `${l.objeto} ${l.orgao} ${l.numero} ${l.cidade ?? ""} ${l.processo_administrativo ?? ""}`;
      const pontos = relevancia(texto, data.objeto);
      if (data.objeto.trim() && pontos < 0.6) return;
      if (data.natureza && l.natureza !== data.natureza) return;
      if (data.portal && l.portal !== data.portal) return;
      if (data.valorMinimo != null && (l.valor_estimado ?? 0) < data.valorMinimo) return;
      if (data.valorMaximo != null && (l.valor_estimado ?? Number.MAX_SAFE_INTEGER) > data.valorMaximo) return;
      l.relevancia = pontos;
      if (!encontradas.has(l.fonte_id)) encontradas.set(l.fonte_id, l);
    };

    // Tempo máximo de varredura: a pesquisa precisa responder mesmo com o PNCP lento.
    const prazoFinal = Date.now() + (data.profundidade === "rapida" ? 15000 : data.profundidade === "total" ? 50000 : 30000);
    const noPrazo = () => Date.now() < prazoFinal && requisicoes < limiteRequisicoes;

    // Fila com várias consultas simultâneas (por modalidade/UF) em vez de uma a uma.
    const fila = [...consultas];
    const trabalhador = async () => {
      while (noPrazo()) {
        const consulta = fila.shift();
        if (!consulta) return;
        const primeira = new URLSearchParams(consulta.base);
        primeira.set("pagina", "1");
        requisicoes++;
        const inicial = await buscarPagina(consulta.caminho, primeira);
        if (!inicial) {
          erros.push(
            "O Portal Nacional (PNCP) recusou parte das consultas por limite de requisições. Tente novamente em alguns instantes ou use a varredura rápida.",
          );
          continue;
        }
        inicial.lista.forEach(registrar);

        const totalPaginas = Math.min(inicial.totalPaginas, maxPaginasPorConsulta);
        const paginas: number[] = [];
        for (let p = 2; p <= totalPaginas; p++) paginas.push(p);

        for (let i = 0; i < paginas.length; i += 3) {
          if (!noPrazo()) break;
          const bloco = paginas.slice(i, i + 3);
          requisicoes += bloco.length;
          const respostas = await Promise.all(
            bloco.map((p) => {
              const params = new URLSearchParams(consulta.base);
              params.set("pagina", String(p));
              return buscarPagina(consulta.caminho, params);
            }),
          );
          respostas.forEach((r) => r?.lista.forEach(registrar));
        }
      }
    };

    // Poucas chamadas ao mesmo tempo: o PNCP bloqueia (429) varreduras agressivas.
    const simultaneas = data.profundidade === "total" ? 4 : 3;
    await Promise.all(Array.from({ length: simultaneas }, trabalhador));
    if (fila.length > 0) {
      erros.push(
        "A varredura foi interrompida pelo tempo limite; refine o objeto ou os estados para cobrir mais resultados.",
      );
    }


    const ordenador = ORDENACOES[(data.ordenar as Ordenacao) ?? "relevancia"] ?? ORDENACOES.relevancia;
    const lista = [...encontradas.values()].sort(ordenador);

    return {
      licitacoes: lista.slice(0, 500),
      total: lista.length,
      consultasFeitas: requisicoes,
      erros: [...new Set(erros)],
    };
  });

export const buscarItensPncp = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ cnpj: z.string(), ano: z.number(), sequencial: z.number() }).parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const res = await fetch(
        `${BASE}/orgaos/${data.cnpj}/compras/${data.ano}/${data.sequencial}/itens?pagina=1&tamanhoPagina=200`,
        { headers: CABECALHOS },
      );
      if (!res.ok) return { itens: [] as any[] };
      const payload = (await res.json()) as unknown;
      const lista = (Array.isArray(payload) ? payload : ((payload as any)?.data ?? [])) as any[];
      return {
        itens: lista.map((i) => ({
          numero_item: String(i.numeroItem ?? ""),
          descricao: String(i.descricao ?? i.materialOuServicoNome ?? ""),
          quantidade: i.quantidade != null ? Number(i.quantidade) : null,
          unidade: i.unidadeMedida ?? null,
          valor_unitario_estimado: i.valorUnitarioEstimado != null ? Number(i.valorUnitarioEstimado) : null,
          valor_total_estimado: i.valorTotal != null ? Number(i.valorTotal) : null,
          lote: i.numeroGrupo != null ? String(i.numeroGrupo) : null,
        })),
      };
    } catch {
      return { itens: [] as any[] };
    }
  });

/**
 * Reconsulta uma contratação específica no PNCP para detectar mudanças de
 * datas (prorrogação), situação (suspensa/revogada) e valores.
 */
export const sincronizarLicitacaoPncp = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ cnpj: z.string(), ano: z.number(), sequencial: z.number() }).parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const res = await fetch(
        `${BASE}/orgaos/${data.cnpj}/compras/${data.ano}/${data.sequencial}`,
        { headers: CABECALHOS },
      );
      if (!res.ok) return { ok: false as const, licitacao: null };
      const payload = (await res.json()) as unknown;
      const bruto = (Array.isArray(payload) ? payload[0] : ((payload as any)?.data ?? payload)) as any;
      if (!bruto) return { ok: false as const, licitacao: null };
      return { ok: true as const, licitacao: mapear(bruto) };
    } catch {
      return { ok: false as const, licitacao: null };
    }
  });

/** Extrai cnpj/ano/sequencial do numeroControlePNCP (ex.: 12345678000199-1-000123/2026). */
export function partesDoFonteId(fonteId?: string | null) {
  if (!fonteId) return null;
  const m = /^(\d{14})-\d+-(\d+)\/(\d{4})$/.exec(fonteId.trim());
  if (m) return { cnpj: m[1]!, sequencial: Number(m[2]), ano: Number(m[3]) };
  const alt = /^(\d{14})-(\d{4})-(\d+)$/.exec(fonteId.trim());
  if (alt) return { cnpj: alt[1]!, ano: Number(alt[2]), sequencial: Number(alt[3]) };
  return null;
}
