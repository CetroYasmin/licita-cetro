import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, ExternalLink, Eye, EyeOff, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { data as fData, dataHora, moeda } from "@/lib/formato";
import { buscarItensPncp } from "@/lib/pncp.functions";
import {
  ESTADOS_PADRAO,
  MODALIDADES_PADRAO,
  MODALIDADES_PROPOSTA,
  PALAVRAS_OBRAS_PADRAO,
  TODOS_ESTADOS,
  buscarPropostasUf,
  testarConexaoPncp,
  type PropostaPncp,
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
  const itensDe = useServerFn(buscarItensPncp);
  const { equipeId, user, perfil } = useAuth();
  const qc = useQueryClient();

  const [ufs, setUfs] = useState<string[]>([...ESTADOS_PADRAO]);
  const [modalidades, setModalidades] = useState<number[]>([...MODALIDADES_PADRAO]);
  const [dias, setDias] = useState("180");
  const [valorMinimo, setValorMinimo] = useState("0");
  const [palavras, setPalavras] = useState(PALAVRAS_OBRAS_PADRAO);
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [ocultarVistas, setOcultarVistas] = useState(true);
  const [acompanhadas, setAcompanhadas] = useState<string[]>([]);

  const acompanhar = useMutation({
    mutationFn: async (l: PropostaPncp) => {
      if (!equipeId) throw new Error("Equipe não definida");
      const { data: lic, error } = await supabase
        .from("licitacoes")
        .insert({
          equipe_id: equipeId,
          created_by: user?.id ?? null,
          numero: l.numero,
          modalidade: l.modalidade,
          orgao: l.unidade ? `${l.orgao} — ${l.unidade}` : l.orgao,
          objeto: l.objeto,
          data_publicacao: l.data_publicacao ? l.data_publicacao.slice(0, 10) : null,
          data_abertura: l.data_abertura_proposta ? l.data_abertura_proposta.slice(0, 10) : null,
          data_sessao: l.data_abertura_proposta,
          site_url: l.link,
          processo_administrativo: l.processo,
          valor_estimado: l.valor_estimado,
          cidade: l.cidade,
          uf: l.uf,
          status: "publicada",
          proximo_evento: "Encerramento do envio de propostas",
          proximo_evento_data: l.encerramento_proposta,
          fonte: "PNCP",
          fonte_id: l.chave,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (l.orgao_cnpj && l.ano && l.sequencial) {
        try {
          const { itens } = await itensDe({
            data: { cnpj: l.orgao_cnpj, ano: l.ano, sequencial: l.sequencial },
          });
          if (itens.length > 0) {
            await supabase.from("licitacao_itens").insert(
              itens.map((i: any) => ({
                licitacao_id: lic.id,
                equipe_id: equipeId,
                numero_item: i.numero_item,
                lote: i.lote,
                descricao: i.descricao,
                quantidade: i.quantidade,
                unidade: i.unidade,
                valor_unitario_estimado: i.valor_unitario_estimado,
                valor_total_estimado: i.valor_total_estimado,
              })),
            );
          }
        } catch {
          /* itens são complemento opcional */
        }
      }
      return l.chave;
    },
    onSuccess: (chave) => {
      setAcompanhadas((v) => [...v, chave]);
      toast.success("Licitação adicionada ao acompanhamento.");
    },
    onError: () => toast.error("Não foi possível adicionar ao acompanhamento."),
  });


  const { data: vistas } = useQuery({
    queryKey: ["visualizacoes-boletim-real", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () =>
      (
        await supabase
          .from("visualizacoes")
          .select("fonte_id,user_id,user_nome")
          .not("fonte_id", "is", null)
          .limit(5000)
      ).data ?? [],
  });

  const vistaPor = (fonteId: string) =>
    (vistas ?? []).filter((v) => v.fonte_id === fonteId).map((v) => v.user_nome ?? "membro");
  const euVi = (fonteId: string) =>
    (vistas ?? []).some((v) => v.fonte_id === fonteId && v.user_id === user?.id);

  const marcarVista = useMutation({
    mutationFn: async ({ fonteId, remover }: { fonteId: string; remover: boolean }) => {
      if (!equipeId || !user) throw new Error("sem equipe");
      if (remover) {
        const { error } = await supabase
          .from("visualizacoes")
          .delete()
          .eq("fonte_id", fonteId)
          .eq("user_id", user.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("visualizacoes").insert({
        equipe_id: equipeId,
        user_id: user.id,
        user_nome: perfil?.nome ?? perfil?.email ?? "membro",
        fonte_id: fonteId,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["visualizacoes-boletim-real"] }),
    onError: () => toast.error("Não foi possível registrar a visualização."),
  });

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

  const visiveisPorUf = resultados.map((r) =>
    (r.data?.licitacoes ?? []).filter((l) => !(ocultarVistas && euVi(l.chave))),
  );
  const totalEncontrado = visiveisPorUf.reduce((s, arr) => s + arr.length, 0);
  const totalOculto = resultados.reduce(
    (s, r) => s + (r.data?.licitacoes.length ?? 0),
    0,
  ) - totalEncontrado;
  const comResultado = visiveisPorUf.filter((arr) => arr.length > 0).length;
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

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={ocultarVistas}
            onCheckedChange={(v) => setOcultarVistas(Boolean(v))}
          />
          Ocultar as que eu já marquei como vistas
        </label>

      </div>

      {consulta && (
        <p className="mb-3 text-xs text-muted-foreground">
          Prazo de proposta até {fData(limite)} · {consulta.ufs.length} estado(s) ·{" "}
          {consulta.modalidades.length} modalidade(s) · valor mínimo{" "}
          {consulta.valorMinimo > 0 ? moeda(consulta.valorMinimo) : "sem filtro"} ·{" "}
          {carregando
            ? `consultando ${concluidas}/${resultados.length} estados…`
            : `${totalEncontrado} licitação(ões) em ${comResultado}/${resultados.length} estados${
                totalOculto > 0
                  ? ` (${totalOculto} oculta${totalOculto > 1 ? "s" : ""} porque você já viu)`
                  : ""
              }`}
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
          const itensVisiveis = itens.filter((l) => !(ocultarVistas && euVi(l.chave)));
          const ocultosAqui = itens.length - itensVisiveis.length;
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
                    ✓ concluído — {itensVisiveis.length} encontrada(s)
                    {ocultosAqui > 0 && (
                      <span className="ml-1 text-muted-foreground/70">
                        ({ocultosAqui} oculta{ocultosAqui > 1 ? "s" : ""} porque você já viu)
                      </span>
                    )}
                  </span>
                )}
              </h2>

              {!r?.isPending && itensVisiveis.length === 0 && !r?.isError && (
                <p className="text-sm italic text-muted-foreground">
                  {itens.length > 0
                    ? "Todas as licitações deste estado já foram marcadas como vistas por você."
                    : "Nenhuma licitação encontrada nesse estado com os filtros atuais."}
                </p>
              )}

              <div className="space-y-4">
                {itensVisiveis
                  .filter((l) => !(ocultarVistas && euVi(l.chave)))
                  .map((l) => {
                    const quem = vistaPor(l.chave);
                    const vi = euVi(l.chave);
                    const enc = l.encerramento_proposta;
                    const venceHoje =
                      Boolean(enc) &&
                      new Date(enc as string).toDateString() === new Date().toDateString();
                    const numero = l.chave.split("|")[0];
                    return (
                      <div key={l.chave} className="overflow-hidden rounded-md border shadow-sm">
                        {/* Barra superior — azul institucional */}
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-secondary px-4 py-2 text-secondary-foreground">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display text-sm font-semibold">{numero}</span>
                            <span className="text-xs opacity-90">{l.modalidade}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {venceHoje && (
                              <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-primary-foreground">
                                Vencimento hoje
                              </span>
                            )}
                            {!vi && (
                              <button
                                type="button"
                                title="Marcar como vista"
                                onClick={() =>
                                  marcarVista.mutate({ fonteId: l.chave, remover: false })
                                }
                                className="rounded p-1 opacity-80 transition-opacity hover:bg-white/10 hover:opacity-100"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-3 p-4">
                          <p className="text-sm">
                            <span className="font-semibold">Objeto: </span>
                            <span className="text-muted-foreground">{l.objeto}</span>
                          </p>

                          <div className="grid gap-x-8 gap-y-2 border-t pt-3 text-sm sm:grid-cols-2">
                            <div>
                              <p>
                                <span className="font-semibold">Datas: </span>
                                <span className="ml-1 inline-block rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                                  Abertura: {dataHora(l.data_abertura_proposta)}
                                </span>
                                {enc && (
                                  <span className="ml-1 inline-block rounded border px-2 py-0.5 text-xs">
                                    Propostas até: {dataHora(enc)}
                                  </span>
                                )}
                              </p>
                              <p className="mt-2">
                                <span className="font-semibold">Publicado: </span>
                                {fData(l.data_publicacao)}
                              </p>
                              <p className="mt-2">
                                <span className="font-semibold">Cidade/Estado: </span>
                                {l.cidade}/{l.uf}
                              </p>
                              <p className="mt-2">
                                <span className="font-semibold">Processo: </span>
                                {l.processo ?? "—"}
                              </p>
                            </div>
                            <div>
                              <p>
                                <span className="font-semibold">Valor estimado: </span>
                                <span className="font-semibold text-primary">
                                  {l.valor_estimado != null
                                    ? moeda(l.valor_estimado)
                                    : "orçamento sigiloso ou não publicado"}
                                </span>
                              </p>
                              <p className="mt-2">
                                <span className="font-semibold">Órgão: </span>
                                {l.orgao}
                                {l.unidade ? ` — ${l.unidade}` : ""}
                              </p>
                              <p className="mt-2">
                                <span className="font-semibold">Origem: </span>
                                {l.link_origem ? "portal do órgão" : "PNCP"}
                              </p>
                              {quem.length > 0 && (
                                <p className="mt-2 text-xs text-secondary">
                                  Vista por {quem.join(", ")}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                            {l.link && (
                              <Button variant="secondary" size="sm" asChild>
                                <a href={l.link} target="_blank" rel="noreferrer">
                                  Ver edital <ExternalLink className="ml-1 h-3 w-3" />
                                </a>
                              </Button>
                            )}
                            {l.link_origem && (
                              <Button variant="outline" size="sm" asChild>
                                <a href={l.link_origem} target="_blank" rel="noreferrer">
                                  Portal de origem <ExternalLink className="ml-1 h-3 w-3" />
                                </a>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              disabled={acompanhar.isPending || acompanhadas.includes(l.chave)}
                              onClick={() => acompanhar.mutate(l)}
                            >
                              <Download className="mr-1 h-3 w-3" />
                              {acompanhadas.includes(l.chave) ? "Acompanhando" : "Acompanhar"}
                            </Button>
                            <Button

                              variant="outline"
                              size="sm"
                              onClick={() => marcarVista.mutate({ fonteId: l.chave, remover: vi })}
                            >
                              {vi ? (
                                <>
                                  <EyeOff className="mr-1 h-3 w-3" /> Desmarcar
                                </>
                              ) : (
                                <>
                                  <Eye className="mr-1 h-3 w-3" /> Marcar como vista
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
