import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, Eye, EyeOff, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODALIDADES, NATUREZAS, UFS, data as fData, dataHora, moeda } from "@/lib/formato";
import {
  buscarItensPncp,
  buscarLicitacoesPncp,
  type LicitacaoPncp,
} from "@/lib/pncp.functions";
import { useDetalhesPncp } from "@/hooks/useDetalhesPncp";
import { usePortais } from "@/hooks/usePortais";
import { registrarAlerta, registrarMovimentacao } from "@/lib/registro";

export const Route = createFileRoute("/pesquisa")({
  head: () => ({
    meta: [
      { title: "Pesquisa de licitações - Licitações Cetro" },
      {
        name: "description",
        content:
          "Pesquise licitações públicas por objeto, estados, modalidade, portal e natureza do serviço, com ordenação e marcação de licitações já vistas pela equipe.",
      },
      { property: "og:title", content: "Pesquisa de licitações - Licitações Cetro" },
      {
        property: "og:description",
        content: "Busque licitações nos portais públicos e envie para o acompanhamento da equipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pesquisa,
});

const ORDENACOES = [
  { valor: "relevancia", label: "Mais relevantes para o objeto" },
  { valor: "encerramento", label: "Prazo de proposta (mais próximo)" },
  { valor: "sessao", label: "Data da sessão (mais próxima)" },
  { valor: "publicacao", label: "Publicação (mais recente)" },
  { valor: "valor_desc", label: "Maior valor estimado" },
  { valor: "valor_asc", label: "Menor valor estimado" },
  { valor: "orgao", label: "Órgão (A–Z)" },
  { valor: "uf", label: "Estado (A–Z)" },
];

function Pesquisa() {
  const { equipeId, user, perfil } = useAuth();
  const qc = useQueryClient();
  const buscar = useServerFn(buscarLicitacoesPncp);
  const itensDe = useServerFn(buscarItensPncp);

  const [objeto, setObjeto] = useState("");
  const [excluir, setExcluir] = useState("");
  const [ufs, setUfs] = useState<string[]>([]);
  const [modalidade, setModalidade] = useState("todas");
  const [natureza, setNatureza] = useState("todas");
  const [valorMinimo, setValorMinimo] = useState("");
  const [valorMaximo, setValorMaximo] = useState("");
  const [ordenar, setOrdenar] = useState("relevancia");
  const [incluirEncerradas, setIncluirEncerradas] = useState(false);
  const [ocultarVistas, setOcultarVistas] = useState(false);
  const [somentePortaisAtivos, setSomentePortaisAtivos] = useState(false);
  const [resultados, setResultados] = useState<LicitacaoPncp[]>([]);
  const [importadas, setImportadas] = useState<string[]>([]);

  const { portalAtivo, desativados } = usePortais();
  const {
    detalhes,
    detalheDe,

    pendenteDe,
    valorDe,
    sigilosoDe,
    portalDe,
    linkOrigemDe,
    linkProcessoDe,
    aberturaDe,
    encerramentoDe,
    situacaoDe,
    modalidadeDe,
    disputaDe,
    processoDe,
    unidadeDe,
    itensDe,
    publicacaoDe,
  } = useDetalhesPncp(resultados, "pesquisa");

  const { data: anotacoes } = useQuery({
    queryKey: ["anotacoes-pesquisa", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () =>
      (await supabase.from("anotacoes_pesquisa").select("fonte_id,texto").limit(2000)).data ?? [],
  });

  const anotacaoDe = (fonteId: string) =>
    (anotacoes ?? []).find((a) => a.fonte_id === fonteId)?.texto ?? "";

  const salvarAnotacao = useMutation({
    mutationFn: async ({ fonteId, texto }: { fonteId: string; texto: string }) => {
      if (!equipeId) throw new Error("sem equipe");
      const { error } = await supabase.from("anotacoes_pesquisa").upsert(
        {
          equipe_id: equipeId,
          fonte_id: fonteId,
          texto,
          autor_id: user?.id ?? null,
          autor_nome: perfil?.nome ?? perfil?.email ?? null,
        },
        { onConflict: "equipe_id,fonte_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Anotação salva.");
      void qc.invalidateQueries({ queryKey: ["anotacoes-pesquisa"] });
    },
    onError: () => toast.error("Não foi possível salvar a anotação."),
  });


  const { data: vistas } = useQuery({
    queryKey: ["visualizacoes-pesquisa", equipeId],
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
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["visualizacoes-pesquisa"] }),
    onError: () => toast.error("Não foi possível registrar a visualização."),
  });

  const pesquisa = useMutation({
    mutationFn: async () =>
      buscar({
         data: {
           objeto,
           excluir,
           ufs,
           modalidade: modalidade === "todas" ? "" : modalidade,
           natureza: natureza === "todas" ? "" : natureza,
           portal: "",
           valorMinimo: valorMinimo ? Number(valorMinimo) : undefined,
           valorMaximo: valorMaximo ? Number(valorMaximo) : undefined,
           incluirEncerradas,
           ordenar,
         },
      }),
    onSuccess: (r) => {
      setResultados(r.licitacoes);
      if (r.erros.length > 0) toast.warning(r.erros[0]);
      toast.success(`${r.total} licitação(ões) encontrada(s) nos portais públicos.`);
    },
    onError: () => toast.error("Não foi possível consultar os portais agora. Tente novamente."),
  });

  const importar = useMutation({
    mutationFn: async (l: LicitacaoPncp) => {
      if (!equipeId) throw new Error("Equipe não definida");
      const ctx = {
        equipeId,
        autorId: user?.id ?? null,
        autorNome: perfil?.nome ?? perfil?.email ?? null,
      };
      const { data: lic, error } = await supabase
        .from("licitacoes")
        .insert({
          equipe_id: equipeId!,
          created_by: user?.id ?? null,
          numero: l.numero,
          modalidade: l.modalidade,
          orgao: l.orgao,
          objeto: l.objeto,
          natureza: l.natureza,
          data_publicacao: l.data_publicacao ? l.data_publicacao.slice(0, 10) : null,
          data_abertura: l.data_abertura ? l.data_abertura.slice(0, 10) : null,
          data_sessao: l.data_abertura,
          plataforma: l.plataforma,
          portal: l.portal,
          site_url: l.site_url,
          processo_administrativo: l.processo_administrativo,
          valor_estimado: valorDe(l),
          cidade: l.cidade,
          uf: l.uf,
          status: "publicada",
          proximo_evento: "Encerramento do envio de propostas",
          proximo_evento_data: l.encerramento_proposta,
          fonte: "PNCP",
          fonte_id: l.fonte_id,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { itens } = await itensDe({
        data: { cnpj: l.orgao_cnpj, ano: l.ano, sequencial: l.sequencial },
      });
      if (itens.length > 0) {
        await supabase.from("licitacao_itens").insert(
          itens.map((i: any) => ({
            licitacao_id: lic.id,
            equipe_id: equipeId!,
            numero_item: i.numero_item,
            lote: i.lote,
            descricao: i.descricao,
            quantidade: i.quantidade,
            unidade: i.unidade,
            valor_unitario_estimado: i.valor_unitario_estimado,
            valor_total_estimado: i.valor_total_estimado,
            situacao: "em aberto",
          })),
        );
        await supabase
          .from("licitacoes")
          .update({
            qtd_itens: itens.length,
            qtd_lotes: new Set(itens.map((i: any) => i.lote).filter(Boolean)).size || null,
          })
          .eq("id", lic.id);
      }

      const prazos = [
        l.encerramento_proposta && {
          tipo: "Envio de proposta",
          descricao: "Prazo final para envio da proposta no portal",
          data_limite: l.encerramento_proposta,
        },
        l.data_abertura && {
          tipo: "Sessão de disputa",
          descricao: "Abertura da sessão pública / início dos lances",
          data_limite: l.data_abertura,
        },
        l.data_abertura && {
          tipo: "Intenção de recurso",
          descricao: "Prazo estimado (3 dias após a sessão) para manifestar intenção de recurso",
          data_limite: new Date(new Date(l.data_abertura).getTime() + 3 * 86400000).toISOString(),
        },
        l.data_abertura && {
          tipo: "Recurso",
          descricao: "Prazo estimado (3 dias úteis após a intenção) para apresentar razões de recurso",
          data_limite: new Date(new Date(l.data_abertura).getTime() + 6 * 86400000).toISOString(),
        },
        l.data_abertura && {
          tipo: "Contrarrazões",
          descricao: "Prazo estimado para contrarrazões",
          data_limite: new Date(new Date(l.data_abertura).getTime() + 9 * 86400000).toISOString(),
        },
      ].filter(Boolean) as Array<{ tipo: string; descricao: string; data_limite: string }>;

      if (prazos.length > 0) {
        await supabase
          .from("prazos")
          .insert(prazos.map((p) => ({ ...p, licitacao_id: lic.id, equipe_id: equipeId! })));
      }

      if (l.site_url) {
        await supabase.from("documentos").insert({
          licitacao_id: lic.id,
          equipe_id: equipeId!,
          tipo: "edital",
          nome: "Edital / processo no portal de origem",
          url: l.site_url,
        });
      }

      await registrarMovimentacao(
        ctx,
        lic.id,
        "importação",
        `Licitação importada da pesquisa nos portais públicos (${l.portal}) por ${ctx.autorNome ?? "usuário"}.`,
      );
      await registrarAlerta(
        ctx,
        lic.id,
        "importação",
        `Nova licitação importada: ${l.numero}`,
        `${l.orgao} — ${l.objeto?.slice(0, 140)}`,
      );
      return l.fonte_id;
    },
    onSuccess: (fonteId) => {
      setImportadas((v) => [...v, fonteId]);
      toast.success("Licitação adicionada ao acompanhamento, com itens e prazos.");
      void qc.invalidateQueries({ queryKey: ["licitacoes"] });
    },
    onError: (e: any) =>
      toast.error(
        String(e?.message ?? "").includes("duplicate")
          ? "Essa licitação já está sendo acompanhada."
          : "Não foi possível importar essa licitação.",
      ),
  });

  const visiveis = useMemo(() => {
    let lista = ocultarVistas ? resultados.filter((l) => !euVi(l.fonte_id)) : [...resultados];
    if (somentePortaisAtivos) {
      // Sem detalhe carregado ainda o edital continua visível (evita "sumir" resultado).
      lista = lista.filter((l) => {
        const d = detalheDe(l);
        return !d || portalAtivo(d.portal);
      });
    }
    const dataValida = (valor: string | null) => {
      if (!valor) return Number.POSITIVE_INFINITY;
      const tempo = new Date(valor).getTime();
      return Number.isNaN(tempo) ? Number.POSITIVE_INFINITY : tempo;
    };
    const valorLic = (l: LicitacaoPncp) => valorDe(l);
    const valorOuFim = (valor: number | null) => valor == null ? Number.POSITIVE_INFINITY : valor;
    const comparadores: Record<string, (a: LicitacaoPncp, b: LicitacaoPncp) => number> = {
      relevancia: (a, b) => b.relevancia - a.relevancia,
      encerramento: (a, b) => dataValida(encerramentoDe(a)) - dataValida(encerramentoDe(b)),
      sessao: (a, b) => dataValida(aberturaDe(a)) - dataValida(aberturaDe(b)),
      publicacao: (a, b) => {
        if (!a.data_publicacao) return 1;
        if (!b.data_publicacao) return -1;
        return dataValida(b.data_publicacao) - dataValida(a.data_publicacao);
      },
      valor_desc: (a, b) => {
        const va = valorLic(a);
        const vb = valorLic(b);
        if (va == null) return 1;
        if (vb == null) return -1;
        return vb - va;
      },
      valor_asc: (a, b) => valorOuFim(valorLic(a)) - valorOuFim(valorLic(b)),
      orgao: (a, b) => a.orgao.localeCompare(b.orgao, "pt-BR"),
      uf: (a, b) => (a.uf ?? "").localeCompare(b.uf ?? "", "pt-BR"),
    };
    return lista.sort(comparadores[ordenar] ?? comparadores["relevancia"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocultarVistas, ordenar, resultados, user?.id, vistas, detalhes, somentePortaisAtivos]);


  return (
    <AppLayout
      titulo="Pesquisa de licitações"
      descricao="Busca nos portais públicos (PNCP e sistemas de origem)"
    >
      <div className="space-y-5">
        <div className="surface-panel grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
          <div className="space-y-1 md:col-span-3 xl:col-span-2">
            <Label>Objeto</Label>
            <Input
              value={objeto}
              onChange={(e) => setObjeto(e.target.value)}
              placeholder='ex.: pavimentação asfáltica, "construção de creche", drenagem'
            />
            <p className="text-[11px] text-muted-foreground">
              Busca tolerante a acentos, plural e erros de digitação. Separe alternativas por vírgula
              e use aspas para frases exatas.
            </p>
          </div>
          <div className="space-y-1 md:col-span-3 xl:col-span-2">
            <Label>Palavras a excluir</Label>
            <Input
              value={excluir}
              onChange={(e) => setExcluir(e.target.value)}
              placeholder="ex.: medicamento, merenda, combustível"
            />
            <p className="text-[11px] text-muted-foreground">
              Editais que citarem estas palavras ficam fora do resultado.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Natureza do serviço</Label>
            <Select value={natureza} onValueChange={setNatureza}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as naturezas</SelectItem>
                {NATUREZAS.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Modalidade</Label>
            <Select value={modalidade} onValueChange={setModalidade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as modalidades</SelectItem>
                {MODALIDADES.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Ordenar por</Label>
            <Select value={ordenar} onValueChange={setOrdenar}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDENACOES.map((o) => (
                  <SelectItem key={o.valor} value={o.valor}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Valor mínimo</Label>
            <Input type="number" value={valorMinimo} onChange={(e) => setValorMinimo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Valor máximo</Label>
            <Input type="number" value={valorMaximo} onChange={(e) => setValorMaximo(e.target.value)} />
          </div>

          <div className="space-y-2 md:col-span-3 xl:col-span-4">
            <div className="flex flex-wrap items-center gap-3">
              <Label>Estados (nenhum selecionado = todos os estados)</Label>
              {ufs.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setUfs([])}>
                  Limpar seleção
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {UFS.map((u) => {
                const ativo = ufs.includes(u);
                return (
                  <button
                    key={u}
                    type="button"
                    onClick={() =>
                      setUfs((v) => (ativo ? v.filter((x) => x !== u) : [...v, u]))
                    }
                    className={`rounded border px-2 py-1 text-xs transition-colors ${
                      ativo
                        ? "border-secondary bg-secondary text-secondary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {u}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 md:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={incluirEncerradas}
                onCheckedChange={(v) => setIncluirEncerradas(Boolean(v))}
              />
              Incluir licitações com propostas já encerradas (últimos 90 dias)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={ocultarVistas} onCheckedChange={(v) => setOcultarVistas(Boolean(v))} />
              Ocultar as que eu já vi
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={somentePortaisAtivos}
                onCheckedChange={(v) => setSomentePortaisAtivos(Boolean(v))}
              />
              Somente portais liberados em “Gerenciar portais”
              {desativados.length > 0 && (
                <span className="text-xs text-muted-foreground">({desativados.length} desligado[s])</span>
              )}
            </label>
          </div>
          <div className="flex items-end md:col-span-1 xl:col-span-2">
            <Button className="w-full" onClick={() => pesquisa.mutate()} disabled={pesquisa.isPending}>
              <Search className="mr-2 h-4 w-4" />
              {pesquisa.isPending ? "Consultando portais…" : "Pesquisar licitações"}
            </Button>
          </div>
        </div>

        {resultados.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {visiveis.length} de {resultados.length} resultado(s) exibido(s). O filtro de natureza
            classifica o objeto do edital — selecione “Obras e engenharia” para ver apenas construção
            civil e obras.
          </p>
        )}

        <div className="space-y-4">
          {visiveis.map((l) => {
            const quem = vistaPor(l.fonte_id);
            const vi = euVi(l.fonte_id);
            const enc = encerramentoDe(l);
            const venceHoje =
              Boolean(enc) && new Date(enc as string).toDateString() === new Date().toDateString();
            return (
              <li key={l.fonte_id} className="overflow-hidden rounded-md border shadow-sm">
                {/* Barra superior — azul institucional */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-secondary px-4 py-2 text-secondary-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-semibold">{l.numero}</span>
                    <span className="text-xs opacity-90">
                      {modalidadeDe(l)} · {l.natureza}
                    </span>

                    {situacaoDe(l) && (
                      <span className="rounded border border-secondary-foreground/30 px-1.5 py-0.5 text-[10px] uppercase">
                        {situacaoDe(l)}
                      </span>
                    )}
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
                        onClick={() => marcarVista.mutate({ fonteId: l.fonte_id, remover: false })}
                        className="rounded p-1 opacity-80 transition-opacity hover:bg-white/10 hover:opacity-100"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  {/* Objeto */}
                  <p className="text-sm">
                    <span className="font-semibold">Objeto: </span>
                    <span className="text-muted-foreground">{l.objeto}</span>
                  </p>

                  {/* Grade de informações */}
                  <div className="grid gap-x-8 gap-y-2 border-t pt-3 text-sm sm:grid-cols-2">
                    <div>
                      <p>
                        <span className="font-semibold">Datas: </span>
                        <span className="ml-1 inline-block rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                          Abertura: {dataHora(aberturaDe(l))}
                        </span>
                        {enc && (
                          <span className="ml-1 inline-block rounded border px-2 py-0.5 text-xs">
                            Propostas até: {dataHora(enc)}
                          </span>
                        )}
                      </p>
                      <p className="mt-2">
                        <span className="font-semibold">Publicado: </span>
                        {fData(publicacaoDe(l))}
                      </p>
                      <p className="mt-2">
                        <span className="font-semibold">Cidade/Estado: </span>
                        {(detalheDe(l)?.cidade ?? l.cidade) ?? "—"}/
                        {(detalheDe(l)?.uf ?? l.uf) ?? "—"}
                      </p>
                      <p className="mt-2">
                        <span className="font-semibold">Processo: </span>
                        {processoDe(l) ?? "—"}
                        {itensDe(l) != null ? ` · ${itensDe(l)} item(ns)` : ""}
                      </p>
                    </div>
                    <div>
                      <p>
                        <span className="font-semibold">Valor estimado: </span>
                        <span className="font-semibold text-primary">
                          {valorDe(l) != null
                            ? moeda(valorDe(l) as number)
                            : pendenteDe(l)
                              ? "consultando valor…"
                              : sigilosoDe(l)
                                ? "orçamento sigiloso (só no edital)"
                                : "não publicado pelo órgão"}
                        </span>
                      </p>
                      <p className="mt-2">
                        <span className="font-semibold">Órgão: </span>
                        {detalheDe(l)?.orgao ?? l.orgao}
                        {unidadeDe(l) ? ` — ${unidadeDe(l)}` : ""}
                      </p>
                      <p className="mt-2">
                        <span className="font-semibold">Portal da disputa: </span>
                        {portalDe(l)}
                        {disputaDe(l) ? ` · ${disputaDe(l)}` : ""}
                        {l.plataforma ? ` · Esfera: ${l.plataforma}` : ""}
                      </p>
                      {quem.length > 0 && (
                        <p className="mt-2 text-xs text-secondary">
                          Vista por {quem.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Anotações da equipe */}
                  <div className="space-y-1 border-t pt-3">
                    <Label className="text-xs">Anotações da equipe sobre este edital</Label>
                    <Textarea
                      rows={2}
                      defaultValue={anotacaoDe(l.fonte_id)}
                      placeholder="ex.: exige atestado de pavimentação; conferir garantia de proposta"
                      onBlur={(e) => {
                        const texto = e.target.value.trim();
                        if (texto !== anotacaoDe(l.fonte_id)) {
                          salvarAnotacao.mutate({ fonteId: l.fonte_id, texto });
                        }
                      }}
                    />
                  </div>


                  {/* Ações */}
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    {l.site_url && (
                      <Button variant="secondary" size="sm" asChild>
                        <a href={l.site_url} target="_blank" rel="noreferrer">
                          Ver edital <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    )}
                    {linkOrigemDe(l) && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={linkOrigemDe(l) as string} target="_blank" rel="noreferrer">
                          Portal de origem <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={importar.isPending || importadas.includes(l.fonte_id)}
                      onClick={() => importar.mutate(l)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {importadas.includes(l.fonte_id) ? "Importada" : "Acompanhar"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => marcarVista.mutate({ fonteId: l.fonte_id, remover: vi })}
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
              </li>
            );
          })}
          {resultados.length === 0 && !pesquisa.isPending && (
            <div className="surface-panel p-10 text-center text-sm text-muted-foreground">
              Informe o objeto e os filtros e clique em “Pesquisar licitações” para trazer editais dos
              portais públicos.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
