import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { dataHora, moeda, numero } from "@/lib/formato";
import { baixarCsv } from "@/lib/registro";
import { exportarPlanilhaAcompanhamento } from "@/lib/planilha";


export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios de desempenho - Licitações Cetro" },
      {
        name: "description",
        content:
          "Taxa de sucesso, valores disputados e vencidos, desempenho por órgão e exportação da base de licitações.",
      },
      { property: "og:title", content: "Relatórios de desempenho - Licitações Cetro" },
      {
        property: "og:description",
        content: "Indicadores de participação e resultados em licitações públicas.",
      },
    ],
  }),
  component: Relatorios,
});

function Relatorios() {
  const { equipeId } = useAuth();

  const { data } = useQuery({
    queryKey: ["relatorios"],
    enabled: Boolean(equipeId),
    queryFn: async () => {
      const { data } = await supabase.from("licitacoes").select("*");
      return (data ?? []) as any[];
    },
  });

  const lics = data ?? [];
  const participadas = lics.filter((l) => l.valor_ofertado != null || l.resultado_final);
  const vencidas = lics.filter((l) => l.status === "vencida" || l.resultado_final === "vencedora");
  const perdidas = lics.filter((l) => l.status === "perdida" || l.resultado_final === "perdida");
  const taxa = participadas.length ? (vencidas.length / participadas.length) * 100 : 0;
  const totalDisputado = participadas.reduce((s, l) => s + (l.valor_ofertado ?? 0), 0);
  const totalVencido = vencidas.reduce((s, l) => s + (l.valor_ofertado ?? 0), 0);

  /** Planilha operacional: sessões mais próximas primeiro. */
  const planilha = [...lics].sort((a, b) => {
    const ta = a.data_sessao ? new Date(a.data_sessao).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.data_sessao ? new Date(b.data_sessao).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  const porOrgao = new Map<string, { total: number; vencidas: number; valor: number }>();
  for (const l of lics) {
    const k = l.orgao ?? "—";
    const at = porOrgao.get(k) ?? { total: 0, vencidas: 0, valor: 0 };
    at.total += 1;
    if (l.status === "vencida") at.vencidas += 1;
    at.valor += l.valor_ofertado ?? 0;
    porOrgao.set(k, at);
  }

  return (
    <AppLayout
      titulo="Relatórios"
      descricao="Desempenho da empresa nas licitações acompanhadas"
      acoes={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            baixarCsv(
              "licitacoes-cetro",
              lics.map((l) => ({
                numero: l.numero,
                orgao: l.orgao,
                modalidade: l.modalidade,
                natureza: l.natureza,
                uf: l.uf,
                status: l.status,
                valor_estimado: l.valor_estimado,
                valor_ofertado: l.valor_ofertado,
                posicao: l.posicao_empresa,
                resultado: l.resultado_final,
              })),
            )
          }
        >
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Card titulo="Licitações acompanhadas" valor={numero(lics.length)} />
        <Card titulo="Taxa de sucesso" valor={`${taxa.toFixed(1)}%`} />
        <Card titulo="Valor total disputado" valor={moeda(totalDisputado)} />
        <Card titulo="Valor vencido" valor={moeda(totalVencido)} />
        <Card titulo="Vencidas" valor={numero(vencidas.length)} />
        <Card titulo="Perdidas" valor={numero(perdidas.length)} />
        <Card titulo="Participações" valor={numero(participadas.length)} />
        <Card
          titulo="Em andamento"
          valor={numero(
            lics.filter((l) => ["publicada", "em disputa", "em análise"].includes(l.status)).length,
          )}
        />
      </div>

      <div className="surface-panel mt-5 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <div>
            <h3 className="text-sm font-semibold">Planilha de acompanhamento</h3>
            <p className="text-xs text-muted-foreground">
              Órgão, modalidade/nº, objeto com a qualificação técnica exigida, município, valor
              global estimado e data/hora da sessão.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportarPlanilhaAcompanhamento(
                "LICITACOES_ESPERANDO_REALIZACAO",
                planilha.map((l) => ({
                  orgao: (l.orgao ?? "").toUpperCase(),
                  modalidade: `${l.modalidade ?? ""}${l.numero ? ` Nº ${l.numero}` : ""}`.trim(),
                  objeto: l.objeto ?? "",
                  qualificacao: l.qualificacao_tecnica ?? "",
                  localizacao: [l.cidade, l.uf].filter(Boolean).join("/"),
                  valor: l.valor_estimado ?? null,
                  sigiloso: Boolean(l.orcamento_sigiloso),
                  dataSessao: l.data_sessao ?? null,
                })),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Exportar planilha
          </Button>

        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Órgão</th>
              <th className="p-3">Modalidade / Nº</th>
              <th className="p-3">Objeto / Qualificação técnica</th>
              <th className="p-3">Estado / Município</th>
              <th className="p-3 text-right">Valor global estimado</th>
              <th className="p-3">Data / Hora</th>
            </tr>
          </thead>
          <tbody className="divide-y align-top">
            {planilha.map((l) => (
              <tr key={l.id}>
                <td className="p-3 font-medium uppercase">{l.orgao ?? "—"}</td>
                <td className="p-3">
                  {l.modalidade ?? "—"}
                  {l.numero ? ` nº ${l.numero}` : ""}
                </td>
                <td className="max-w-xl p-3">
                  <p className="font-medium">{l.objeto ?? "—"}</p>
                  {l.qualificacao_tecnica && (
                    <p className="mt-2 whitespace-pre-line text-xs text-primary">
                      {l.qualificacao_tecnica}
                    </p>
                  )}
                </td>
                <td className="p-3">{[l.cidade, l.uf].filter(Boolean).join("/") || "—"}</td>
                <td className="p-3 text-right">
                  {l.valor_estimado != null ? moeda(l.valor_estimado) : "—"}
                </td>
                <td className="p-3">{l.data_sessao ? dataHora(l.data_sessao) : "—"}</td>
              </tr>
            ))}
            {planilha.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-muted-foreground">
                  Nenhuma licitação em acompanhamento ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="surface-panel mt-5 overflow-x-auto">
        <h3 className="border-b p-4 text-sm font-semibold">Desempenho por órgão</h3>
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Órgão</th>
              <th className="p-3">Licitações</th>
              <th className="p-3">Vencidas</th>
              <th className="p-3">Valor ofertado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[...porOrgao.entries()]
              .sort((a, b) => b[1].total - a[1].total)
              .map(([orgao, v]) => (
                <tr key={orgao}>
                  <td className="p-3">{orgao}</td>
                  <td className="p-3">{numero(v.total)}</td>
                  <td className="p-3">{numero(v.vencidas)}</td>
                  <td className="p-3">{moeda(v.valor)}</td>
                </tr>
              ))}
            {porOrgao.size === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-muted-foreground">Sem dados ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

function Card({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="surface-panel p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-2 font-display text-xl font-semibold">{valor}</p>
    </div>
  );
}
