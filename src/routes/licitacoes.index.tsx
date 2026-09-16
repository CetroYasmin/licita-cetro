import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Star, Trash2, Download, Eye, EyeOff, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  MODALIDADES,
  NATUREZAS,
  STATUS_LICITACAO,
  UFS,
  corDoStatus,
  data as fData,
  dataHora,
  moeda,
} from "@/lib/formato";
import { baixarCsv } from "@/lib/registro";
import { combina } from "@/lib/busca";
import { EditarSessaoValor, sessaoJaOcorreu } from "@/components/EditarSessaoValor";

export const Route = createFileRoute("/licitacoes/")({
  head: () => ({
    meta: [
      { title: "Licitações - Licitações Cetro" },
      {
        name: "description",
        content:
          "Pesquise e filtre licitações por número, órgão, objeto, modalidade, cidade, valor, status e participação da empresa.",
      },
      { property: "og:title", content: "Licitações - Licitações Cetro" },
      {
        property: "og:description",
        content: "Busca e organização das licitações acompanhadas pela sua empresa.",
      },
    ],
  }),
  component: ListaLicitacoes,
});

function ListaLicitacoes() {
  const { equipeId, user, perfil } = useAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [modalidade, setModalidade] = useState("todas");
  const [uf, setUf] = useState("todas");
  const [natureza, setNatureza] = useState("todas");
  const [pasta, setPasta] = useState("todas");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [somenteParticipando, setSomenteParticipando] = useState(false);
  const [somenteFavoritos, setSomenteFavoritos] = useState(false);
  const [ordenar, setOrdenar] = useState("sessao");
  const [ocultarVistas, setOcultarVistas] = useState(false);

  const { data: pastas } = useQuery({
    queryKey: ["pastas", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () => (await supabase.from("pastas").select("id,nome").order("nome")).data ?? [],
  });

  const { data: vistas } = useQuery({
    queryKey: ["visualizacoes-licitacoes", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () =>
      (
        await supabase
          .from("visualizacoes")
          .select("licitacao_id,user_id,user_nome")
          .not("licitacao_id", "is", null)
          .limit(5000)
      ).data ?? [],
  });


  const { data: licitacoes, isLoading } = useQuery({
    queryKey: ["licitacoes", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () =>
      (
        await supabase
          .from("licitacoes")
          .select("*")
          .order("data_sessao", { ascending: true, nullsFirst: false })
      ).data ?? [],
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("licitacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Licitação removida do acompanhamento.");
      void qc.invalidateQueries({ queryKey: ["licitacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarQualificacao = useMutation({
    mutationFn: async ({ id, valor }: { id: string; valor: string }) => {
      const { error } = await supabase
        .from("licitacoes")
        .update({ qualificacao_tecnica: valor })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Qualificação técnica salva.");
      void qc.invalidateQueries({ queryKey: ["licitacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const favoritar = useMutation({
    mutationFn: async ({ id, valor }: { id: string; valor: boolean }) => {
      const { error } = await supabase.from("licitacoes").update({ favorito: valor }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["licitacoes"] }),
  });

  const marcarVista = useMutation({
    mutationFn: async ({ id, remover }: { id: string; remover: boolean }) => {
      if (!equipeId || !user) throw new Error("sem equipe");
      if (remover) {
        const { error } = await supabase
          .from("visualizacoes")
          .delete()
          .eq("licitacao_id", id)
          .eq("user_id", user.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("visualizacoes").insert({
        equipe_id: equipeId,
        user_id: user.id,
        user_nome: perfil?.nome ?? perfil?.email ?? "membro",
        licitacao_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["visualizacoes-licitacoes"] }),
    onError: () => toast.error("Não foi possível registrar a visualização."),
  });

  const vistaPor = (id: string) =>
    (vistas ?? []).filter((v: any) => v.licitacao_id === id).map((v: any) => v.user_nome ?? "membro");
  const euVi = (id: string) => (vistas ?? []).some((v: any) => v.licitacao_id === id && v.user_id === user?.id);

  const filtradas = useMemo(() => {
    const lista = (licitacoes ?? []).filter((l: any) => {
      const texto = `${l.numero} ${l.orgao ?? ""} ${l.objeto ?? ""} ${l.processo_administrativo ?? ""} ${(l.tags ?? []).join(" ")}`;
      if (!combina(texto, busca)) return false;
      if (status !== "todos" && l.status !== status) return false;
      if (modalidade !== "todas" && l.modalidade !== modalidade) return false;
      if (uf !== "todas" && l.uf !== uf) return false;
      if (natureza !== "todas" && l.natureza !== natureza) return false;
      if (pasta !== "todas" && l.pasta_id !== pasta) return false;
      if (valorMin && (l.valor_estimado ?? 0) < Number(valorMin)) return false;
      if (valorMax && (l.valor_estimado ?? 0) > Number(valorMax)) return false;
      if (dataDe && (!l.data_sessao || new Date(l.data_sessao) < new Date(dataDe))) return false;
      if (somenteParticipando && l.valor_ofertado == null) return false;
      if (somenteFavoritos && !l.favorito) return false;
      if (sessaoJaOcorreu(l)) return false;
      if (ocultarVistas && (vistas ?? []).some((v: any) => v.licitacao_id === l.id && v.user_id === user?.id))
        return false;
      return true;
    });

    const texto = (v?: string | null) => v ?? "";
    const ordenadores: Record<string, (a: any, b: any) => number> = {
      sessao: (a, b) => {
        const q = (l: any) => {
          const s = l.proximo_evento_data ?? l.data_sessao;
          const t = s ? new Date(s).getTime() : NaN;
          return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
        };
        return q(a) - q(b);
      },
      publicacao: (a, b) => texto(b.data_publicacao).localeCompare(texto(a.data_publicacao)),
      atualizacao: (a, b) => texto(b.ultima_atualizacao).localeCompare(texto(a.ultima_atualizacao)),
      valor_desc: (a, b) => (b.valor_estimado ?? 0) - (a.valor_estimado ?? 0),
      valor_asc: (a, b) => (a.valor_estimado ?? 0) - (b.valor_estimado ?? 0),
      proposta_desc: (a, b) => (b.valor_ofertado ?? 0) - (a.valor_ofertado ?? 0),
      orgao: (a, b) => texto(a.orgao).localeCompare(texto(b.orgao), "pt-BR"),
      numero: (a, b) => texto(a.numero).localeCompare(texto(b.numero), "pt-BR"),
      status: (a, b) => texto(a.status).localeCompare(texto(b.status), "pt-BR"),
      uf: (a, b) => texto(a.uf).localeCompare(texto(b.uf)),
    };
    return [...lista].sort(ordenadores[ordenar] ?? ordenadores["sessao"]);
  }, [
    licitacoes,
    busca,
    ordenar,
    ocultarVistas,
    vistas,
    user,

    status,
    modalidade,
    uf,
    natureza,
    pasta,
    valorMin,
    valorMax,
    dataDe,
    somenteParticipando,
    somenteFavoritos,
  ]);

  return (
    <AppLayout
      titulo="Licitações"
      descricao={`${filtradas.length} licitação(ões) encontrada(s)`}
      acoes={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              baixarCsv(
                "licitacoes",
                filtradas.map((l: any) => ({
                  numero: l.numero,
                  modalidade: l.modalidade,
                  orgao: l.orgao,
                  objeto: l.objeto,
                  natureza: l.natureza,
                  status: l.status,
                  cidade: l.cidade,
                  uf: l.uf,
                  sessao: l.data_sessao,
                  valor_estimado: l.valor_estimado,
                  valor_ofertado: l.valor_ofertado,
                  posicao: l.posicao_empresa,
                  resultado: l.resultado_final,
                })),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Exportar
          </Button>
          <Button asChild size="sm">
            <Link to="/pesquisa">Pesquisar</Link>
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="surface-panel grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
          <div className="space-y-1 md:col-span-2 xl:col-span-2">
            <Label>Busca por número, órgão, objeto ou etiqueta</Label>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="ex.: pavimentação" />
            <p className="text-[11px] text-muted-foreground">
              Busca tolerante a acentos e erros; separe alternativas por vírgula e use aspas para
              frases exatas.
            </p>
          </div>
          <Campo label="Ordenar por">
            <Select value={ordenar} onValueChange={setOrdenar}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sessao">Data da sessão (mais próxima)</SelectItem>
                <SelectItem value="publicacao">Publicação (mais recente)</SelectItem>
                <SelectItem value="atualizacao">Última atualização</SelectItem>
                <SelectItem value="valor_desc">Maior valor estimado</SelectItem>
                <SelectItem value="valor_asc">Menor valor estimado</SelectItem>
                <SelectItem value="proposta_desc">Maior proposta nossa</SelectItem>
                <SelectItem value="orgao">Órgão (A–Z)</SelectItem>
                <SelectItem value="numero">Número</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="uf">Estado (A–Z)</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {STATUS_LICITACAO.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Modalidade">
            <Select value={modalidade} onValueChange={setModalidade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {MODALIDADES.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Natureza">
            <Select value={natureza} onValueChange={setNatureza}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {NATUREZAS.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="UF">
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {UFS.map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Pasta/projeto">
            <Select value={pasta} onValueChange={setPasta}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {(pastas ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Valor mínimo">
            <Input type="number" value={valorMin} onChange={(e) => setValorMin(e.target.value)} />
          </Campo>
          <Campo label="Valor máximo">
            <Input type="number" value={valorMax} onChange={(e) => setValorMax(e.target.value)} />
          </Campo>
          <Campo label="Sessão a partir de">
            <Input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
          </Campo>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={somenteParticipando}
                onCheckedChange={(v) => setSomenteParticipando(Boolean(v))}
              />
              Participando
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={somenteFavoritos}
                onCheckedChange={(v) => setSomenteFavoritos(Boolean(v))}
              />
              Favoritas
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={ocultarVistas} onCheckedChange={(v) => setOcultarVistas(Boolean(v))} />
              Ocultar vistas
            </label>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando licitações…</p>
        ) : filtradas.length === 0 ? (
          <div className="surface-panel p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma licitação encontrada com esses filtros.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtradas.map((l: any) => (
              <div key={l.id} className="surface-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/licitacoes/$id"
                        params={{ id: l.id }}
                        className="font-display font-semibold hover:underline"
                      >
                        {l.numero}
                      </Link>
                      <Badge variant="outline" className={corDoStatus(l.status)}>{l.status}</Badge>
                      {l.aprovacao_status === "aprovada" && (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          Diretoria: aprovada
                        </Badge>
                      )}
                      {l.aprovacao_status === "reprovada" && (
                        <Badge variant="destructive">Diretoria: reprovada</Badge>
                      )}
                      {l.aprovacao_resposta_solicitada && (
                        <Badge variant="secondary">Diretoria aguarda resposta</Badge>
                      )}
                      {l.modalidade && <Badge variant="secondary">{l.modalidade}</Badge>}
                      {l.natureza && <Badge variant="outline">{l.natureza}</Badge>}
                      {(l.tags ?? []).map((t: string) => (
                        <Badge key={t} variant="outline">#{t}</Badge>
                      ))}
                      {vistaPor(l.id).length > 0 && (
                        <Badge variant="outline" className="border-secondary/40 text-secondary">
                          Vista por {vistaPor(l.id).join(", ")}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{l.objeto}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {l.orgao} · {l.cidade ?? "—"}/{l.uf ?? "—"} · Publicação: {fData(l.data_publicacao)} ·
                      Sessão: {dataHora(l.proximo_evento_data ?? l.data_sessao)} · Portal:{" "}
                      {l.portal ?? "—"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs">
                      <span>Estimado: <strong>{moeda(l.valor_estimado)}</strong></span>
                      <span>Nossa proposta: <strong>{moeda(l.valor_ofertado)}</strong></span>
                      <span>Melhor valor: <strong>{moeda(l.melhor_valor)}</strong></span>
                      <span>
                        Posição: <strong>{l.posicao_empresa ? `${l.posicao_empresa}º` : "—"}</strong>
                      </span>
                    </div>
                    <div className="mt-3 space-y-1">
                      <Label className="text-xs">
                        Atualizar data da sessão (adiamento) e valor estimado
                      </Label>
                      <EditarSessaoValor licitacao={l} compacto />
                    </div>
                    <div className="mt-3 space-y-1">
                      <Label className="text-xs">Qualificação técnica exigida pelo edital</Label>
                      <Textarea
                        defaultValue={l.qualificacao_tecnica ?? ""}
                        rows={3}
                        placeholder={
                          "Ex.: 1- Execução de piso intertravado de 6cm\n2- Revestimento cerâmico\n3- Alvenaria de tijolo cerâmico"
                        }
                        onBlur={(e) => {
                          const valor = e.target.value;
                          if (valor === (l.qualificacao_tecnica ?? "")) return;
                          salvarQualificacao.mutate({ id: l.id, valor });
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Salva automaticamente ao sair do campo.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {l.site_url && (
                      <Button variant="secondary" size="sm" asChild>
                        <a href={l.site_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1 h-3.5 w-3.5" /> Site da licitação
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={euVi(l.id) ? "Desmarcar como vista" : "Marcar como vista"}
                      onClick={() => marcarVista.mutate({ id: l.id, remover: euVi(l.id) })}
                    >
                      {euVi(l.id) ? (
                        <EyeOff className="h-4 w-4 text-secondary" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Favoritar"
                      onClick={() => favoritar.mutate({ id: l.id, valor: !l.favorito })}
                    >
                      <Star
                        className={`h-4 w-4 ${l.favorito ? "fill-warning text-warning" : "text-muted-foreground"}`}
                      />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Excluir licitação">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir do acompanhamento?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A licitação {l.numero} e todo o histórico, itens, documentos, prazos e chat
                            serão removidos da equipe. Essa ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => excluir.mutate(l.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
