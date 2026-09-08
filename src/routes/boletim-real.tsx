import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { data as fData, moeda } from "@/lib/formato";
import {
  ESTADOS_PADRAO,
  MODALIDADES_PADRAO,
  MODALIDADES_PROPOSTA,
  PALAVRAS_OBRAS_PADRAO,
  TODOS_ESTADOS,
  buscarPropostasUf,
  testarConexaoPncp,
} from "@/lib/pncp-proposta.functions";

export const Route = createFileRoute("/boletim-real")({
  head: () => ({
    meta: [
      { title: "Boletim real PNCP - Licitações Cetro" },
      {
        name: "description",
        content:
          "Consulta ao vivo na base pública do PNCP: apenas licitações com prazo de proposta ainda em aberto, filtradas por estado, modalidade, valor mínimo e palavras do objeto.",
      },
      { property: "og:title", content: "Boletim real PNCP - Licitações Cetro" },
      {
        property: "og:description",
        content:
          "Boletim ao vivo de obras e serviços de engenharia com propostas em aberto, direto da base pública do PNCP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BoletimReal,
});

type Consulta = {
  chave: number;
  ufs: string[];
  modalidades: number[];
  dias: number;
  valorMinimo: number;
  palavras: string;
};

function BoletimReal() {
  const buscar = useServerFn(buscarPropostasUf);
  const testar = useServerFn(testarConexaoPncp);

  const [ufs, setUfs] = useState<string[]>([...ESTADOS_PADRAO]);
  const [modalidades, setModalidades] = useState<number[]>([...MODALIDADES_PADRAO]);
  const [dias, setDias] = useState("180");
  const [valorMinimo, setValorMinimo] = useState("0");
  const [palavras, setPalavras] = useState(PALAVRAS_OBRAS_PADRAO);
  const [consulta, setConsulta] = useState<Consulta | null>(null);

  const teste = useMutation({ mutationFn: async () => testar() });

  const alternarUf = (uf: string) =>
    setUfs((v) => (v.includes(uf) ? v.filter((x) => x !== uf) : [...v, uf]));
  const alternarModalidade = (id: number) =>
    setModalidades((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  const gerar = () => {
    if (ufs.length === 0 || modalidades.length === 0) return;
    setConsulta({
      chave: Date.now(),
      ufs: TODOS_ESTADOS.filter((u) => ufs.includes(u)),
      modalidades: MODALIDADES_PROPOSTA.filter((m) => modalidades.includes(m.id)).map((m) => m.id),
      dias: Number(dias) || 180,
      valorMinimo: Number(valorMinimo) || 0,
      palavras,
    });
  };

  const resultados = useQueries({
    queries: (consulta?.ufs ?? []).map((uf) => ({
      queryKey: ["boletim-real", consulta?.chave, uf],
      enabled: Boolean(consulta),
      staleTime: 5 * 60 * 1000,
      retry: 1,
      queryFn: async () =>
        buscar({
          data: {
            uf,
            modalidades: consulta!.modalidades,
            dias: consulta!.dias,
            valorMinimo: consulta!.valorMinimo,
            palavras: consulta!.palavras,
          },
        }),
    })),
  });

  const concluidas = resultados.filter((r) => !r.isPending).length;
  const carregando = consulta != null && concluidas < resultados.length;
  const totalEncontrado = resultados.reduce((s, r) => s + (r.data?.licitacoes.length ?? 0), 0);
  const comResultado = resultados.filter((r) => (r.data?.licitacoes.length ?? 0) > 0).length;
  const falhas = resultados.flatMap((r, i) =>
    r.isError ? [consulta!.ufs[i]] : (r.data?.erros ?? []),
  );

  const limite = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (Number(dias) || 180));
    return d.toISOString();
  }, [dias]);

  return (
    <AppLayout
      titulo="Boletim real PNCP"
      descricao="Consulta ao vivo na base pública do PNCP — somente licitações com prazo de proposta ainda em aberto"
      acoes={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => teste.mutate()}
            disabled={teste.isPending}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", teste.isPending && "animate-spin")} />
            Testar conexão
          </Button>
          <Button size="sm" onClick={gerar} disabled={carregando}>
            {carregando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            {carregando ? "Consultando…" : "Gerar boletim de hoje"}
          </Button>
        </>
      }
    >
      <div className="surface-panel mb-4 space-y-2 p-4 text-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Autoteste de conexão com a base do PNCP
        </div>
        {teste.isPending && <p className="text-muted-foreground">Consultando…</p>}
        {teste.data?.ok && (
          <p>
            <span className="font-semibold text-primary">OK</span> — respondeu em {teste.data.ms}ms
            {teste.data.registros > 0
              ? ` com ${teste.data.registros} contratação(ões) de teste.`
              : " (sem registros nesse recorte, mas a conexão funcionou)."}
          </p>
        )}
        {teste.data && !teste.data.ok && (
          <p className="text-destructive">
            Falhou em {teste.data.ms}ms
            {teste.data.status ? ` (HTTP ${teste.data.status})` : ""}
            {teste.data.mensagem ? ` — ${teste.data.mensagem}` : ""}. A base pode estar
            momentaneamente indisponível; tente novamente em alguns instantes.
          </p>
        )}
        {!teste.data && !teste.isPending && (
          <p className="text-muted-foreground">
            Clique em “Testar conexão” para conferir se a base do PNCP está respondendo agora.
          </p>
        )}
      </div>

      <div className="surface-panel mb-4 space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Label>Estados</Label>
            <button
              type="button"
              className="text-xs underline text-muted-foreground"
              onClick={() =>
                setUfs(ufs.length === TODOS_ESTADOS.length ? [] : [...TODOS_ESTADOS])
              }
            >
              marcar todos / limpar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {TODOS_ESTADOS.map((uf) => (
              <button
                key={uf}
                type="button"
                onClick={() => alternarUf(uf)}
                className={cn(
                  "rounded border px-2 py-1 text-xs font-medium transition",
                  ufs.includes(uf)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {uf}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Label>Modalidades</Label>
            <button
              type="button"
              className="text-xs underline text-muted-foreground"
              onClick={() =>
                setModalidades(
                  modalidades.length === MODALIDADES_PROPOSTA.length
                    ? []
                    : MODALIDADES_PROPOSTA.map((m) => m.id),
                )
              }
            >
              marcar todas / limpar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {MODALIDADES_PROPOSTA.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => alternarModalidade(m.id)}
                className={cn(
                  "rounded border px-2 py-1 text-xs font-medium transition",
                  modalidades.includes(m.id)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {m.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Buscar propostas com prazo até (dias a partir de hoje)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={dias}
              onChange={(e) => setDias(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Valor estimado mínimo (R$)</Label>
            <Input
              type="number"
              min={0}
              step={1000}
              value={valorMinimo}
              onChange={(e) => setValorMinimo(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Palavras-chave no objeto (separadas por vírgula)</Label>
          <Input value={palavras} onChange={(e) => setPalavras(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Deixe em branco para trazer todos os objetos. Com valor mínimo definido, os editais de
            orçamento sigiloso também são descartados, pois não há como confirmar o valor.
          </p>
        </div>
      </div>

      {consulta && (
        <p className="mb-3 text-xs text-muted-foreground">
          Prazo de proposta até {fData(limite)} · {consulta.ufs.length} estado(s) ·{" "}
          {consulta.modalidades.length} modalidade(s) · valor mínimo{" "}
          {consulta.valorMinimo > 0 ? moeda(consulta.valorMinimo) : "sem filtro"} ·{" "}
          {carregando
            ? `consultando ${concluidas}/${resultados.length} estados…`
            : `${totalEncontrado} licitação(ões) em ${comResultado}/${resultados.length} estados`}
        </p>
      )}

      {!consulta && (
        <p className="text-sm italic text-muted-foreground">
          Ajuste os filtros acima e clique em “Gerar boletim de hoje” para consultar o PNCP.
        </p>
      )}

      <div className="space-y-6">
        {(consulta?.ufs ?? []).map((uf, i) => {
          const r = resultados[i];
          const itens = r?.data?.licitacoes ?? [];
          return (
            <section key={uf}>
              <h2 className="mb-2 flex flex-wrap items-center gap-2 border-b border-border pb-1 text-sm font-semibold">
                <span className="text-primary">{uf}</span>
                {r?.isPending ? (
                  <span className="text-xs font-normal italic text-muted-foreground">
                    consultando…
                  </span>
                ) : r?.isError ? (
                  <span className="text-xs font-normal text-destructive">
                    falhou — use “Tentar de novo” abaixo
                  </span>
                ) : (
                  <span className="text-xs font-normal text-muted-foreground">
                    ✓ concluído — {itens.length} encontrada(s)
                  </span>
                )}
              </h2>

              {!r?.isPending && itens.length === 0 && !r?.isError && (
                <p className="text-sm italic text-muted-foreground">
                  Nenhuma licitação encontrada nesse estado com os filtros atuais.
                </p>
              )}

              <div className="space-y-2">
                {itens.map((l) => (
                  <article
                    key={l.chave}
                    className="rounded-md border border-border border-l-4 border-l-primary bg-card p-4"
                  >
                    <p className="mb-2 text-sm font-medium leading-snug">{l.objeto}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Órgão: <span className="text-foreground">{l.orgao}</span>
                      </span>
                      <span>
                        Local:{" "}
                        <span className="text-foreground">
                          {l.cidade}/{l.uf}
                        </span>
                      </span>
                      <span>
                        Modalidade: <span className="text-foreground">{l.modalidade}</span>
                      </span>
                      <span>
                        Encerra propostas:{" "}
                        <span className="text-foreground">{fData(l.encerramento_proposta)}</span>
                      </span>
                      <span>
                        Publicação:{" "}
                        <span className="text-foreground">{fData(l.data_publicacao)}</span>
                      </span>
                      <span>
                        Valor estimado:{" "}
                        <span className="text-foreground">
                          {l.valor_estimado != null
                            ? moeda(l.valor_estimado)
                            : "sigiloso / não informado"}
                        </span>
                      </span>
                      {l.processo && (
                        <span>
                          Processo: <span className="text-foreground">{l.processo}</span>
                        </span>
                      )}
                      {l.unidade && (
                        <span>
                          Unidade: <span className="text-foreground">{l.unidade}</span>
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {l.link && (
                        <Button asChild size="sm" variant="outline">
                          <a href={l.link} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" /> Abrir edital no PNCP
                          </a>
                        </Button>
                      )}
                      {l.link_origem && (
                        <Button asChild size="sm" variant="ghost">
                          <a href={l.link_origem} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" /> Portal de origem
                          </a>
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {consulta && !carregando && falhas.length > 0 && (
        <div className="surface-panel mt-6 space-y-2 p-4 text-sm">
          <p className="text-destructive">
            Falhas em {falhas.length} consulta(s): {falhas.slice(0, 6).join(" · ")}
            {falhas.length > 6 ? "…" : ""}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => resultados.forEach((r) => void r.refetch())}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Tentar de novo só as falhas
          </Button>
        </div>
      )}
    </AppLayout>
  );
}
