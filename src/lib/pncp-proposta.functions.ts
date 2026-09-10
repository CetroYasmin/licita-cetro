import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Consulta oficial de contratações com proposta em aberto do PNCP.
 * Usada pela aba "Boletim real PNCP" (consulta ao vivo, sem login).
 */
const BASE = "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta";

const CABECALHOS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
} as const;

export const TODOS_ESTADOS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
] as const;

export const ESTADOS_PADRAO = ["CE", "PE", "SE", "MA", "PI", "AL", "RN"];

export const MODALIDADES_PROPOSTA = [
  { id: 1, nome: "Leilão - Eletrônico" },
  { id: 2, nome: "Diálogo Competitivo" },
  { id: 3, nome: "Concurso" },
  { id: 4, nome: "Concorrência - Eletrônica" },
  { id: 5, nome: "Concorrência - Presencial" },
  { id: 6, nome: "Pregão - Eletrônico" },
  { id: 7, nome: "Pregão - Presencial" },
  { id: 8, nome: "Dispensa de Licitação" },
  { id: 9, nome: "Inexigibilidade" },
  { id: 10, nome: "Manifestação de Interesse" },
  { id: 11, nome: "Pré-qualificação" },
  { id: 12, nome: "Credenciamento" },
  { id: 13, nome: "Leilão - Presencial" },
] as const;

export const MODALIDADES_PADRAO = [2, 4, 5, 6, 7, 8, 11];

export const PALAVRAS_OBRAS_PADRAO =
  "obra, construção, reforma, pavimentação, edificação, engenharia civil, ampliação, drenagem, terraplenagem, alvenaria, cobertura, infraestrutura viária, ponte, viaduto, saneamento, rede de água, esgotamento, calçamento, requalificação urbana";

export type PropostaPncp = {
  chave: string;
  numero: string;
  objeto: string;
  orgao: string;
  orgao_cnpj: string | null;
  ano: number | null;
  sequencial: number | null;
  cidade: string;
  uf: string;
  modalidade: string;
  encerramento_proposta: string | null;
  data_publicacao: string | null;
  data_abertura_proposta: string | null;
  valor_estimado: number | null;
  processo: string | null;
  unidade: string | null;
  link: string | null;
  link_origem: string | null;
};


const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function nomeModalidade(id: number): string {
  return MODALIDADES_PROPOSTA.find((m) => m.id === id)?.nome ?? `mod.${id}`;
}

function mapear(item: any, modalidadeId: number, ufPadrao: string): PropostaPncp {
  const orgaoInfo = item.orgaoEntidade ?? {};
  const unidade = item.unidadeOrgao ?? {};
  const cnpj = orgaoInfo.cnpj;
  const ano = item.anoCompra;
  const seq = item.sequencialCompra;
  const valor = Number(item.valorTotalEstimado ?? 0);
  return {
    chave: `${item.numeroControlePNCP ?? `${cnpj}-${ano}-${seq}`}|${modalidadeId}`,
    numero: item.numeroCompra
      ? `${item.numeroCompra}${ano ? `/${ano}` : ""}`
      : String(item.numeroControlePNCP ?? `${cnpj}-${ano}-${seq}`),
    objeto: String(item.objetoCompra ?? "Objeto não informado"),
    orgao: String(
      orgaoInfo.razaosocial ?? orgaoInfo.razaoSocial ?? orgaoInfo.razaoSocialFormatada ?? "—",
    ),
    orgao_cnpj: cnpj ? String(cnpj) : null,
    ano: ano != null ? Number(ano) : null,
    sequencial: seq != null ? Number(seq) : null,

    cidade: unidade.municipioNome ?? "—",
    uf: unidade.ufSigla ?? ufPadrao,
    modalidade: nomeModalidade(modalidadeId),
    encerramento_proposta: item.dataEncerramentoProposta ?? null,
    data_publicacao: item.dataPublicacaoPncp ?? null,
    data_abertura_proposta: item.dataAberturaProposta ?? null,
    valor_estimado: Number.isFinite(valor) && valor > 0 ? valor : null,
    processo: item.processo ? String(item.processo) : null,
    unidade: unidade.nomeUnidade ?? null,
    link: cnpj && ano && seq ? `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}` : null,
    link_origem: item.linkSistemaOrigem ?? null,
  };
}

/**
 * Fila global: o PNCP responde 429 ("Limite de requisições excedido") quando
 * recebe consultas em rajada. Todas as chamadas passam por aqui, uma por vez,
 * com intervalo mínimo entre elas.
 */
const INTERVALO_MINIMO = 1100;
let ultimaChamada = 0;
let fila: Promise<unknown> = Promise.resolve();

function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
  const proxima = fila.then(async () => {
    const espera_ms = ultimaChamada + INTERVALO_MINIMO - Date.now();
    if (espera_ms > 0) await espera(espera_ms);
    try {
      return await tarefa();
    } finally {
      ultimaChamada = Date.now();
    }
  });
  fila = proxima.catch(() => undefined);
  return proxima as Promise<T>;
}

/** Uma consulta (UF + modalidade), com novas tentativas espaçadas contra o bloqueio do PNCP. */
async function consultar(
  uf: string,
  modalidadeId: number,
  dataFinal: string,
): Promise<{ itens: any[]; erro: string | null }> {
  const url = `${BASE}?dataFinal=${dataFinal}&codigoModalidadeContratacao=${modalidadeId}&uf=${uf}&pagina=1&tamanhoPagina=50`;
  const TENTATIVAS = 6;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const resp = await enfileirar(() =>
        fetch(url, { headers: CABECALHOS, signal: AbortSignal.timeout(20000) }),
      );
      if (resp.status === 204) return { itens: [], erro: null };
      if (resp.status === 429 || resp.status === 503) {
        const cabecalho = Number(resp.headers.get("retry-after") ?? 0);
        const pausa = cabecalho > 0 ? cabecalho * 1000 : 1500 * 2 ** (tentativa - 1);
        if (tentativa === TENTATIVAS) {
          return {
            itens: [],
            erro: `${uf} / ${nomeModalidade(modalidadeId)}: limite de consultas do PNCP — tente novamente em instantes`,
          };
        }
        await espera(Math.min(pausa, 12000) + Math.floor(Math.random() * 400));
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as { data?: unknown[] };
      return { itens: (json.data ?? []) as any[], erro: null };
    } catch (e: any) {
      if (tentativa === TENTATIVAS) {
        return {
          itens: [],
          erro: `${uf} / ${nomeModalidade(modalidadeId)}: ${String(e?.message ?? "falha")}`,
        };
      }
      await espera(900 * tentativa + Math.floor(Math.random() * 400));
    }
  }
  return { itens: [], erro: null };
}


function bate(texto: string, termos: string[]): boolean {
  if (termos.length === 0) return true;
  const t = texto.toLowerCase();
  return termos.some((termo) => t.includes(termo));
}

/** Autoteste de conexão com a API do PNCP (DF, Pregão Eletrônico, 60 dias). */
export const testarConexaoPncp = createServerFn({ method: "POST" }).handler(async () => {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  const dataFinal = d.toISOString().slice(0, 10).replace(/-/g, "");
  const inicio = Date.now();
  try {
    const resp = await fetch(
      `${BASE}?dataFinal=${dataFinal}&codigoModalidadeContratacao=6&uf=DF&pagina=1&tamanhoPagina=5`,
      { headers: CABECALHOS, signal: AbortSignal.timeout(20000) },
    );
    const ms = Date.now() - inicio;
    if (resp.status === 204) return { ok: true, ms, registros: 0, status: 204, mensagem: null };
    if (!resp.ok) return { ok: false, ms, registros: 0, status: resp.status, mensagem: null };
    const json = (await resp.json()) as { totalRegistros?: number; data?: unknown[] };
    return {
      ok: true,
      ms,
      registros: json.totalRegistros ?? json.data?.length ?? 0,
      status: resp.status,
      mensagem: null,
    };
  } catch (e: any) {
    return {
      ok: false,
      ms: Date.now() - inicio,
      registros: 0,
      status: 0,
      mensagem: String(e?.message ?? "erro de rede"),
    };
  }
});

/**
 * Todas as modalidades pedidas de um único estado, uma consulta por vez
 * (o PNCP corta conexões quando recebe várias em rajada).
 */
export const buscarPropostasUf = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        uf: z.string().length(2),
        modalidades: z.array(z.number()).min(1),
        dias: z.number().min(1).max(365).default(180),
        valorMinimo: z.number().min(0).default(0),
        palavras: z.string().default(""),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const alvo = new Date();
    alvo.setDate(alvo.getDate() + data.dias);
    const dataFinal = alvo.toISOString().slice(0, 10).replace(/-/g, "");
    const agora = Date.now();
    const termos = data.palavras
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const erros: string[] = [];
    const vistos = new Set<string>();
    const licitacoes: PropostaPncp[] = [];

    for (const [i, mod] of data.modalidades.entries()) {
      if (i > 0) await espera(350);
      const { itens, erro } = await consultar(data.uf, mod, dataFinal);
      if (erro) erros.push(erro);
      for (const bruto of itens) {
        const l = mapear(bruto, mod, data.uf);
        if (vistos.has(l.chave)) continue;
        if (!bate(l.objeto, termos)) continue;
        if (l.encerramento_proposta && new Date(l.encerramento_proposta).getTime() < agora) continue;
        if (data.valorMinimo > 0 && (l.valor_estimado ?? 0) < data.valorMinimo) continue;
        vistos.add(l.chave);
        licitacoes.push(l);
      }
    }

    licitacoes.sort((a, b) =>
      (a.encerramento_proposta ?? "9999").localeCompare(b.encerramento_proposta ?? "9999"),
    );
    return { uf: data.uf, licitacoes, erros };
  });
