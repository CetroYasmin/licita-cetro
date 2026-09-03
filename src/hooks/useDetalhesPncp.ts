import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { buscarDetalhesPncp, type LicitacaoPncp } from "@/lib/pncp.functions";

/**
 * O índice de pesquisa do PNCP não devolve valor estimado, portal de origem nem
 * as datas reais de proposta. Este hook enriquece os resultados exibidos com o
 * detalhe da contratação — é o que dá à pesquisa a mesma leitura do ConLicitação.
 */
export function useDetalhesPncp(licitacoes: LicitacaoPncp[], chave: string) {
  const buscar = useServerFn(buscarDetalhesPncp);

  const alvos = useMemo(
    () =>
      licitacoes
        .filter((l) => /^\d{14}$/.test(l.orgao_cnpj) && l.sequencial > 0)
        .slice(0, 150)
        .map((l) => ({
          fonte_id: l.fonte_id,
          cnpj: l.orgao_cnpj,
          ano: l.ano,
          sequencial: l.sequencial,
        })),
    [licitacoes],
  );

  const { data, isFetching } = useQuery({
    queryKey: ["detalhes-pncp", chave, alvos.map((a) => a.fonte_id)],
    enabled: alvos.length > 0,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => (await buscar({ data: { contratacoes: alvos } })).detalhes,
  });

  const detalheDe = (l: LicitacaoPncp) => data?.[l.fonte_id];

  return {
    detalhes: data,
    buscando: isFetching,
    detalheDe,
    valorDe: (l: LicitacaoPncp) => detalheDe(l)?.valor_estimado ?? l.valor_estimado ?? null,
    portalDe: (l: LicitacaoPncp) => detalheDe(l)?.portal ?? l.portal,
    linkOrigemDe: (l: LicitacaoPncp) => detalheDe(l)?.link_origem ?? null,
    aberturaDe: (l: LicitacaoPncp) => detalheDe(l)?.data_abertura_proposta ?? l.data_abertura,
    encerramentoDe: (l: LicitacaoPncp) =>
      detalheDe(l)?.data_encerramento_proposta ?? l.encerramento_proposta,
    situacaoDe: (l: LicitacaoPncp) => detalheDe(l)?.situacao ?? l.situacao,
  };
}
