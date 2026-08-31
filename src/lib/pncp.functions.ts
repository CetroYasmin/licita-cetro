import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BASE = "https://pncp.gov.br/api/consulta/v1";

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
};

function nomePortal(link?: string | null): string {
  if (!link) return "Não informado";
  const l = link.toLowerCase();
  if (l.includes("comprasnet") || l.includes("gov.br/compras")) return "Compras.gov.br (ComprasNet)";
  if (l.includes("licitanet")) return "LicitaNet";
  if (l.includes("bll")) return "BLL Compras";
  if (l.includes("bnc")) return "BNC — Bolsa Nacional de Compras";
  if (l.includes("portaldecompraspublicas")) return "Portal de Compras Públicas";
  if (l.includes("licitacoes-e") || l.includes("bb.com.br")) return "Licitações-e (Banco do Brasil)";
  if (l.includes("bec.sp.gov.br")) return "BEC/SP";
  if (l.includes("compras.rs") || l.includes("cel.rs")) return "Compras RS";
  if (l.includes("publinexo")) return "Publinexo";
  if (l.includes("comprasbr")) return "ComprasBR";
  if (l.includes("licitardigital")) return "Licitar Digital";
  if (l.includes("pncp.gov.br")) return "PNCP";
  try {
    return new URL(link).hostname.replace("www.", "");
  } catch {
    return "Não informado";
  }
}

export const buscarLicitacoesPncp = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        palavraChave: z.string().optional().default(""),
        uf: z.string().optional().default(""),
        modalidade: z.string().optional().default(""),
        natureza: z.string().optional().default(""),
        valorMinimo: z.number().optional(),
        valorMaximo: z.number().optional(),
        paginas: z.number().min(1).max(5).optional().default(2),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const codigos = data.modalidade
      ? [MODALIDADE_CODIGOS[data.modalidade] ?? 6]
      : [6, 4, 8, 9, 7, 5];
    const dataFinal = yyyymmdd(new Date(Date.now() + 1000 * 60 * 60 * 24 * 120));
    const resultados: LicitacaoPncp[] = [];
    const erros: string[] = [];

    for (const codigo of codigos) {
      for (let pagina = 1; pagina <= data.paginas; pagina++) {
        const params = new URLSearchParams({
          dataFinal,
          codigoModalidadeContratacao: String(codigo),
          pagina: String(pagina),
          tamanhoPagina: "50",
        });
        if (data.uf) params.set("uf", data.uf);
        let payload: { data?: unknown[]; totalPaginas?: number } | null = null;
        try {
          const res = await fetch(`${BASE}/contratacoes/proposta?${params.toString()}`, {
            headers: { Accept: "application/json" },
          });
          if (res.status === 204) break;
          if (!res.ok) {
            erros.push(`PNCP ${res.status} (modalidade ${codigo})`);
            break;
          }
          payload = (await res.json()) as { data?: unknown[]; totalPaginas?: number };
        } catch (e) {
          erros.push(`Falha de conexão com o PNCP: ${String(e)}`);
          break;
        }
        const lista = (payload?.data ?? []) as any[];
        for (const c of lista) {
          const objeto = String(c.objetoCompra ?? "");
          const natureza = classificarNatureza(objeto);
          const orgaoUnidade = c.unidadeOrgao ?? {};
          resultados.push({
            fonte_id: String(c.numeroControlePNCP ?? `${c.orgaoEntidade?.cnpj}-${c.anoCompra}-${c.sequencialCompra}`),
            numero: String(c.numeroCompra ?? c.numeroControlePNCP ?? "—"),
            modalidade: String(c.modalidadeNome ?? "—"),
            orgao: String(c.orgaoEntidade?.razaoSocial ?? orgaoUnidade.nomeUnidade ?? "—"),
            orgao_cnpj: String(c.orgaoEntidade?.cnpj ?? ""),
            objeto,
            natureza,
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
          });
        }
        if (payload?.totalPaginas != null && pagina >= payload.totalPaginas) break;
      }
    }

    const termo = data.palavraChave.trim().toLowerCase();
    const filtradas = resultados.filter((l) => {
      if (termo && !`${l.objeto} ${l.orgao} ${l.numero}`.toLowerCase().includes(termo)) return false;
      if (data.natureza && l.natureza !== data.natureza) return false;
      if (data.valorMinimo != null && (l.valor_estimado ?? 0) < data.valorMinimo) return false;
      if (data.valorMaximo != null && (l.valor_estimado ?? 0) > data.valorMaximo) return false;
      return true;
    });

    return { licitacoes: filtradas.slice(0, 200), total: filtradas.length, erros };
  });

export const buscarItensPncp = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ cnpj: z.string(), ano: z.number(), sequencial: z.number() }).parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const res = await fetch(
        `${BASE}/orgaos/${data.cnpj}/compras/${data.ano}/${data.sequencial}/itens?pagina=1&tamanhoPagina=200`,
        { headers: { Accept: "application/json" } },
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
