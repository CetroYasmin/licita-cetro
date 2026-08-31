import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Star, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
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
  const { equipeId } = useAuth();
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

  const { data: pastas } = useQuery({
    queryKey: ["pastas", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () => (await supabase.from("pastas").select("id,nome").order("nome")).data ?? [],
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

  const favoritar = useMutation({
    mutationFn: async ({ id, valor }: { id: string; valor: boolean }) => {
      const { error } = await supabase.from("licitacoes").update({ favorito: valor }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["licitacoes"] }),
  });

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (licitacoes ?? []).filter((l: any) => {
      if (
        termo &&
        !`${l.numero} ${l.orgao ?? ""} ${l.objeto ?? ""} ${l.processo_administrativo ?? ""} ${(l.tags ?? []).join(" ")}`
          .toLowerCase()
          .includes(termo)
      )
        return false;
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
      return true;
    });
  }, [
    licitacoes,
    busca,
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
          </div>
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
                      {l.modalidade && <Badge variant="secondary">{l.modalidade}</Badge>}
                      {l.natureza && <Badge variant="outline">{l.natureza}</Badge>}
                      {(l.tags ?? []).map((t: string) => (
                        <Badge key={t} variant="outline">#{t}</Badge>
                      ))}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{l.objeto}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {l.orgao} · {l.cidade ?? "—"}/{l.uf ?? "—"} · Publicação: {fData(l.data_publicacao)} ·
                      Sessão: {dataHora(l.data_sessao)} · Portal: {l.portal ?? "—"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs">
                      <span>Estimado: <strong>{moeda(l.valor_estimado)}</strong></span>
                      <span>Nossa proposta: <strong>{moeda(l.valor_ofertado)}</strong></span>
                      <span>Melhor valor: <strong>{moeda(l.melhor_valor)}</strong></span>
                      <span>
                        Posição: <strong>{l.posicao_empresa ? `${l.posicao_empresa}º` : "—"}</strong>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
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
