import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { relevancia } from "@/lib/busca";

/** Pesquisa oficial do PNCP (mesma usada pelo site do portal). */
const BASE = "https://pncp.gov.br/api/search/";
/** Endpoints de detalhe/itens de uma contratação. */
const BASE_CONSULTA = "https://pncp.gov.br/api/consulta/v1";

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

/** Converte um item da API de pesquisa do PNCP no formato usado pelo app. */
function mapear(c: any): LicitacaoPncp {
  const objeto = String(c.description ?? c.objetoCompra ?? "");
  const cnpj = String(c.orgao_cnpj ?? "");
  const ano = Number(c.ano ?? new Date().getFullYear());
  const sequencial = Number(c.numero_sequencial ?? 0);
  return {
    fonte_id: String(c.numero_controle_pncp ?? `${cnpj}-${ano}-${sequencial}`),
    numero: String(c.numero ?? c.title ?? c.numero_controle_pncp ?? "—").replace(/^Edital nº\s*/i, ""),
    modalidade: String(c.modalidade_licitacao_nome ?? "—").replace(" - ", " "),
    orgao: String(c.orgao_nome ?? c.unidade_nome ?? "—"),
    orgao_cnpj: cnpj,
    objeto,
    natureza: classificarNatureza(objeto),
    data_publicacao: c.data_publicacao_pncp ?? null,
    data_abertura: c.data_inicio_vigencia ?? null,
    data_sessao: c.data_inicio_vigencia ?? null,
    encerramento_proposta: c.data_fim_vigencia ?? null,
    plataforma: String(c.esfera_nome ?? "—"),
    portal: "PNCP",
    site_url: `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${sequencial}`,
    processo_administrativo: c.numero ? String(c.numero) : null,
    valor_estimado: (() => {
      const valor = c.valor_global ?? c.valorTotalEstimado ?? c.valor_total_estimado ?? c.valorEstimado;
      if (valor == null || valor === "") return null;
      const numero = Number(valor);
      return Number.isFinite(numero) && numero > 0 ? numero : null;
    })(),
    cidade: c.municipio_nome ?? null,
    uf: c.uf ?? null,
    situacao: c.cancelado ? "Cancelada" : (c.situacao_nome ?? null),
    ano,
    sequencial,
    relevancia: 0,
  };
}

/** Cache curto por consulta: evita repetir chamadas e estourar o limite do PNCP. */
const cache = new Map<string, { em: number; valor: { lista: any[]; total: number } }>();
const VALIDADE_CACHE = 5 * 60 * 1000;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * O PNCP derruba conexões quando recebe muitas chamadas seguidas do mesmo IP.
 * Cada página tem tempo limite, novas tentativas com espera crescente e cache.
 */
async function buscarPagina(
  params: URLSearchParams,
): Promise<{ lista: any[]; total: number } | null> {
  const alvo = `${BASE}?${params.toString()}`;
  const emCache = cache.get(alvo);
  if (emCache && Date.now() - emCache.em < VALIDADE_CACHE) return emCache.valor;

  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      const res = await fetch(alvo, { headers: CABECALHOS, signal: AbortSignal.timeout(15000) });
      if (res.status === 204) return { lista: [], total: 0 };
      if (res.status === 429 || res.status >= 500) {
        await espera(800 * (tentativa + 1));
        continue;
      }
      if (!res.ok) return null;
      const texto = await res.text();
      if (!texto.trim()) {
        await espera(700 * (tentativa + 1));
        continue;
      }
      const payload = JSON.parse(texto) as { items?: unknown[]; total?: number };
      const valor = {
        lista: (payload?.items ?? []) as any[],
        total: Number(payload?.total ?? 0),
      };
      cache.set(alvo, { em: Date.now(), valor });
      return valor;
    } catch {
      await espera(700 * (tentativa + 1));
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
  valor_desc: (a: LicitacaoPncp, b: LicitacaoPncp) => {
    if (a.valor_estimado == null) return 1;
    if (b.valor_estimado == null) return -1;
    return b.valor_estimado - a.valor_estimado;
  },
  valor_asc: (a: LicitacaoPncp, b: LicitacaoPncp) => {
    if (a.valor_estimado == null) return 1;
    if (b.valor_estimado == null) return -1;
    return a.valor_estimado - b.valor_estimado;
  },
  orgao: (a: LicitacaoPncp, b: LicitacaoPncp) => a.orgao.localeCompare(b.orgao, "pt-BR"),
  uf: (a: LicitacaoPncp, b: LicitacaoPncp) => (a.uf ?? "").localeCompare(b.uf ?? ""),
} as const;

export type Ordenacao = keyof typeof ORDENACOES;

const UFS_TODAS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
] as const;

/** Documentos de contratação publicados no PNCP (edital cobre pregões/concorrências). */
const TIPOS_DOCUMENTO = ["edital"] as const;

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
        ordenar: z.string().optional().default("relevancia"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const codigos = data.modalidade ? [MODALIDADE_CODIGOS[data.modalidade] ?? 6] : [];
    const termo = data.objeto.replace(/["]/g, " ").trim();
    // O PNCP exige um status; "todos" evita perder editais de portais de origem.
    const status = "todos";

    const erros: string[] = [];
    const encontradas = new Map<string, LicitacaoPncp>();
    let requisicoes = 0;

    const LIMITE_REQUISICOES = 420;
    const prazoFinal = Date.now() + 65000;
    const noPrazo = () => Date.now() < prazoFinal && requisicoes < LIMITE_REQUISICOES;

    const agora = Date.now();
    /** `filtrarLocal` = a consulta não filtrou por texto; filtramos aqui com busca tolerante. */
    const registrar = (bruto: any, filtrarLocal: boolean) => {
      const l = mapear(bruto);
      const texto = `${l.objeto} ${l.orgao} ${l.numero} ${l.cidade ?? ""}`;
      const pontos = termo ? relevancia(texto, data.objeto) : 1;
      if (filtrarLocal && termo && pontos < 0.6) return;
      if (!data.incluirEncerradas) {
        const fim = l.encerramento_proposta ? new Date(l.encerramento_proposta).getTime() : null;
        if (fim != null && !Number.isNaN(fim) && fim < agora) return;
        if (l.situacao === "Cancelada") return;
      }
      if (data.natureza && l.natureza !== data.natureza) return;
      if (data.valorMinimo != null && (l.valor_estimado ?? 0) < data.valorMinimo) return;
      if (data.valorMaximo != null && (l.valor_estimado ?? Number.MAX_SAFE_INTEGER) > data.valorMaximo) return;
      l.relevancia = pontos;
      const existente = encontradas.get(l.fonte_id);
      if (!existente || existente.relevancia < pontos) encontradas.set(l.fonte_id, l);
    };

    /**
     * Duas estratégias combinadas para não perder editais:
     *  1) varredura completa por estado (sem termo) filtrando o texto no app —
     *     alcança editais operados em Licitações-e, BLL, Licitanet etc., cujo
     *     texto no PNCP nem sempre casa com o índice de busca do portal;
     *  2) consultas com o termo direto no PNCP, incluindo cada alternativa
     *     separada por vírgula, para alcançar editais mais antigos/profundos.
     */
    const consultas: Array<{ params: URLSearchParams; filtrarLocal: boolean; maxPaginas: number }> = [];

    const TAMANHO_PAGINA = 50;
    const montar = (extras: Record<string, string>, ufs: string[]) => {
      const p = new URLSearchParams({ ordenacao: "-data", tam_pagina: String(TAMANHO_PAGINA), ...extras });
      for (const tipo of TIPOS_DOCUMENTO) p.append("tipos_documento", tipo);
      for (const uf of ufs) p.append("ufs", uf);
      for (const codigo of codigos) p.append("modalidades", String(codigo));
      return p;
    };

    if (termo) {
      // Consultas textuais vêm primeiro: a antiga varredura estadual consumia o
      // prazo antes de chegar à pesquisa nacional, especialmente para PE.
      const palavras = termo
        .split(/[^\p{L}\p{N}/-]+/u)
        .map((p) => p.trim())
        .filter((p) => p.length >= 5);
      const frases = termo.split(/[,;:]|\s+ou\s+/i).map((t) => t.trim());
      const janelas = palavras.length >= 2
        ? [palavras.slice(0, 4).join(" "), palavras.slice(-4).join(" ")]
        : [];
      const identificadores = termo.match(/\b\d{3,}(?:\/\d{2,4})?(?:-[\p{L}\d]+)?\b/gu) ?? [];
      const raras = [...palavras].sort((a, b) => b.length - a.length).slice(0, 4);
      const partes = [termo, ...frases, ...janelas, ...identificadores, ...raras].filter(
        (t, i, a) => t.length > 1 && a.indexOf(t) === i,
      );
      for (const parte of partes) {
        consultas.push({
          params: montar({ q: parte, status }, data.ufs),
          filtrarLocal: false,
          maxPaginas: 30,
        });
      }
    }

    const ufsAlvo = data.ufs.length > 0 ? data.ufs : [...UFS_TODAS];
    const paginasVarredura = 6;
    for (const uf of ufsAlvo) {
      consultas.push({ params: montar({ status }, [uf]), filtrarLocal: true, maxPaginas: paginasVarredura });
    }

    /** Busca um lote de páginas em paralelo controlado (o PNCP cai com excesso). */
    const LOTE = 4;
    let falhas = 0;
    for (const consulta of consultas) {
      let pagina = 1;
      let total = Infinity;
      while (pagina <= consulta.maxPaginas && noPrazo()) {
        const paginas: number[] = [];
        for (let i = 0; i < LOTE && pagina + i <= consulta.maxPaginas; i++) {
          if ((pagina + i - 1) * TAMANHO_PAGINA >= total) break;
          paginas.push(pagina + i);
        }
        if (paginas.length === 0) break;
        requisicoes += paginas.length;
        const respostas = await Promise.all(
          paginas.map((n) => {
            const p = new URLSearchParams(consulta.params);
            p.set("pagina", String(n));
            return buscarPagina(p);
          }),
        );
        let acabou = false;
        for (const resposta of respostas) {
          if (!resposta) {
            falhas++;
            acabou = true;
            continue;
          }
          total = resposta.total;
          resposta.lista.forEach((bruto) => registrar(bruto, consulta.filtrarLocal));
          if (resposta.lista.length < TAMANHO_PAGINA) acabou = true;
        }
        if (acabou) break;
        pagina += paginas.length;
      }
    }
    if (falhas > 0) {
      erros.push(
        "O Portal Nacional (PNCP) recusou parte das consultas; os resultados podem estar incompletos — repita a pesquisa em alguns instantes.",
      );
    }
    if (requisicoes >= LIMITE_REQUISICOES || Date.now() >= prazoFinal) {
      erros.push(
        "A varredura atingiu o tempo limite. Selecionar os estados de interesse deixa a cobertura mais completa.",
      );
    }

    const ordenador = ORDENACOES[(data.ordenar as Ordenacao) ?? "relevancia"] ?? ORDENACOES.relevancia;
    const lista = [...encontradas.values()].sort(ordenador);

    return {
      licitacoes: lista.slice(0, 1000),
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
        `${BASE_CONSULTA}/orgaos/${data.cnpj}/compras/${data.ano}/${data.sequencial}/itens?pagina=1&tamanhoPagina=200`,
        { headers: CABECALHOS, signal: AbortSignal.timeout(10000) },
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
        `${BASE_CONSULTA}/orgaos/${data.cnpj}/compras/${data.ano}/${data.sequencial}`,
        { headers: CABECALHOS, signal: AbortSignal.timeout(10000) },
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
