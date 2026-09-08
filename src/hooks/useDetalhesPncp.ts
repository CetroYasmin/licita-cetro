import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { buscarDetalhesPncp, type LicitacaoPncp } from "@/lib/pncp.functions";

const TAMANHO_LOTE = 12;

/**
 * O índice de pesquisa do PNCP não devolve valor estimado, portal de origem nem
 * as datas reais de proposta. Este hook enriquece os resultados exibidos com o
 * detalhe da contratação — em lotes pequenos e independentes, para que os
 * valores apareçam aos poucos sem travar a exibição da lista.
 */
export function useDetalhesPncp(licitacoes: LicitacaoPncp[], chave: string) {
  const buscar = useServerFn(buscarDetalhesPncp);

  const lotes = useMemo(() => {
    const alvos = licitacoes
      .filter((l) => /^\d{14}$/.test(l.orgao_cnpj) && l.sequencial > 0)
      .slice(0, 150)
      .map((l) => ({
        fonte_id: l.fonte_id,
        cnpj: l.orgao_cnpj,
        ano: l.ano,
        sequencial: l.sequencial,
      }));
    const grupos: (typeof alvos)[] = [];
    for (let i = 0; i < alvos.length; i += TAMANHO_LOTE) {
      grupos.push(alvos.slice(i, i + TAMANHO_LOTE));
    }
    return grupos;
  }, [licitacoes]);

  const resultados = useQueries({
    queries: lotes.map((lote) => ({
      queryKey: ["detalhes-pncp", chave, lote.map((a) => a.fonte_id).join(",")],
      staleTime: 15 * 60 * 1000,
      retry: 1,
      queryFn: async () => (await buscar({ data: { contratacoes: lote } })).detalhes,
    })),
  });

  const data = useMemo(() => {
    const mapa: Record<string, any> = {};
    for (const r of resultados) if (r.data) Object.assign(mapa, r.data);
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultados.map((r) => (r.data ? "1" : "0")).join("")]);

  const detalheDe = (l: LicitacaoPncp) => data[l.fonte_id];
  const pendente = (l: LicitacaoPncp) =>
    !data[l.fonte_id] && resultados.some((r) => r.isFetching);

  return {
    detalhes: data,
    buscando: resultados.some((r) => r.isFetching),
    pendenteDe: pendente,
    detalheDe,
    valorDe: (l: LicitacaoPncp) => l.valor_estimado ?? detalheDe(l)?.valor_estimado ?? null,
    sigilosoDe: (l: LicitacaoPncp) => Boolean(detalheDe(l)?.orcamento_sigiloso),
    portalDe: (l: LicitacaoPncp) => detalheDe(l)?.portal ?? l.portal,
    linkOrigemDe: (l: LicitacaoPncp) => detalheDe(l)?.link_origem ?? null,
    linkProcessoDe: (l: LicitacaoPncp) => detalheDe(l)?.link_processo ?? null,
    aberturaDe: (l: LicitacaoPncp) => detalheDe(l)?.data_abertura_proposta ?? l.data_abertura,
    encerramentoDe: (l: LicitacaoPncp) =>
      detalheDe(l)?.data_encerramento_proposta ?? l.encerramento_proposta,
    situacaoDe: (l: LicitacaoPncp) => detalheDe(l)?.situacao ?? l.situacao,
    modalidadeDe: (l: LicitacaoPncp) => detalheDe(l)?.modalidade ?? l.modalidade,
    disputaDe: (l: LicitacaoPncp) => detalheDe(l)?.disputa ?? null,
    processoDe: (l: LicitacaoPncp) => detalheDe(l)?.processo ?? l.processo_administrativo ?? null,
    unidadeDe: (l: LicitacaoPncp) => detalheDe(l)?.unidade ?? null,
    itensDe: (l: LicitacaoPncp) => detalheDe(l)?.qtd_itens ?? null,
    publicacaoDe: (l: LicitacaoPncp) => detalheDe(l)?.data_publicacao ?? l.data_publicacao,
  };
}

