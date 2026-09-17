import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Check, X, RotateCcw, MessageSquareWarning, Paperclip, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { dataHora, moeda } from "@/lib/formato";
import { registrarAlerta, registrarMovimentacao } from "@/lib/registro";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/aprovacao")({
  head: () => ({
    meta: [
      { title: "Aprovação da diretoria - Licitações Cetro" },
      {
        name: "description",
        content:
          "Painel de aprovação da diretoria para as licitações em acompanhamento, com decisão, observações, pedidos de resposta e arquivos de análise.",
      },
      { property: "og:title", content: "Aprovação da diretoria - Licitações Cetro" },
      {
        property: "og:description",
        content:
          "Aprove ou reprove a participação, peça resposta sobre a observação e anexe orçamentos e composições.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Aprovacao,
});

type Filtro = "pendente" | "aprovada" | "reprovada" | "resposta" | "todas";

const FILTROS: { valor: Filtro; label: string }[] = [
  { valor: "pendente", label: "Aguardando decisão" },
  { valor: "resposta", label: "Aguardando nossa resposta" },
  { valor: "aprovada", label: "Aprovadas" },
  { valor: "reprovada", label: "Reprovadas" },
  { valor: "todas", label: "Todas" },
];

function Aprovacao() {
  const { equipeId, perfil, user, isAdmin, isDiretor } = useAuth();
  const podeAprovar = isAdmin || isDiretor;
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("pendente");

  const autor = perfil?.nome ?? perfil?.email ?? null;
  const ctx = { equipeId: equipeId ?? "", autorId: user?.id ?? null, autorNome: autor };

  const { data, isLoading } = useQuery({
    queryKey: ["aprovacao-licitacoes"],
    enabled: Boolean(equipeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacoes")
        .select("*")
        .order("proximo_evento_data", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ["aprovacao-licitacoes"] });
    void queryClient.invalidateQueries({ queryKey: ["licitacoes"] });
  };

  const decidir = useMutation({
    mutationFn: async (input: {
      licitacao: any;
      status: "pendente" | "aprovada" | "reprovada";
    }) => {
      const { error } = await supabase
        .from("licitacoes")
        .update({
          aprovacao_status: input.status,
          aprovacao_autor_nome: autor,
          aprovacao_autor_id: user?.id ?? null,
          aprovacao_em: new Date().toISOString(),
        })
        .eq("id", input.licitacao.id);
      if (error) throw error;
      if (!equipeId) return;
      const rotulo =
        input.status === "aprovada"
          ? "aprovou a participação"
          : input.status === "reprovada"
            ? "não aprovou a participação"
            : "devolveu para análise";
      const titulo = `Diretoria ${rotulo}`;
      const referencia = `${input.licitacao.modalidade ?? "Licitação"}${
        input.licitacao.numero ? ` nº ${input.licitacao.numero}` : ""
      }`;
      await registrarAlerta(ctx, input.licitacao.id, "aprovacao", titulo, referencia);
      await registrarMovimentacao(ctx, input.licitacao.id, "aprovacao", `${titulo} (${referencia})`);
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar a decisão."),
  });

  const salvarObs = useMutation({
    mutationFn: async (input: { id: string; observacao: string }) => {
      const { error } = await supabase
        .from("licitacoes")
        .update({ aprovacao_observacao: input.observacao || null })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Observação da diretoria salva.");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar a observação."),
  });

  const pedirResposta = useMutation({
    mutationFn: async (input: { licitacao: any; solicitar: boolean }) => {
      const { error } = await supabase
        .from("licitacoes")
        .update({
          aprovacao_resposta_solicitada: input.solicitar,
          ...(input.solicitar ? {} : {}),
        })
        .eq("id", input.licitacao.id);
      if (error) throw error;
      if (!equipeId || !input.solicitar) return;
      await registrarAlerta(
        ctx,
        input.licitacao.id,
        "aprovacao",
        "Diretoria pediu resposta sobre a observação",
        input.licitacao.aprovacao_observacao ?? null,
      );
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.solicitar ? "Pedido de resposta enviado à equipe." : "Pedido de resposta encerrado.",
      );
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível registrar o pedido."),
  });

  const responder = useMutation({
    mutationFn: async (input: { licitacao: any; resposta: string }) => {
      const { error } = await supabase
        .from("licitacoes")
        .update({
          aprovacao_resposta: input.resposta || null,
          aprovacao_resposta_em: new Date().toISOString(),
          aprovacao_resposta_autor_nome: autor,
          aprovacao_resposta_solicitada: false,
        })
        .eq("id", input.licitacao.id);
      if (error) throw error;
      if (!equipeId) return;
      await registrarAlerta(
        ctx,
        input.licitacao.id,
        "aprovacao",
        "Resposta enviada à diretoria",
        input.resposta,
      );
    },
    onSuccess: () => {
      toast.success("Resposta registrada para a diretoria.");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar a resposta."),
  });

  const lics = data ?? [];
  const sessaoDe = (l: any): string | null => l.proximo_evento_data ?? l.data_sessao ?? null;

  const contagem = {
    pendente: lics.filter((l) => (l.aprovacao_status ?? "pendente") === "pendente").length,
    resposta: lics.filter((l) => l.aprovacao_resposta_solicitada).length,
    aprovada: lics.filter((l) => l.aprovacao_status === "aprovada").length,
    reprovada: lics.filter((l) => l.aprovacao_status === "reprovada").length,
    todas: lics.length,
  };

  const lista = lics
    .filter((l) =>
      filtro === "todas"
        ? true
        : filtro === "resposta"
          ? Boolean(l.aprovacao_resposta_solicitada)
          : (l.aprovacao_status ?? "pendente") === filtro,
    )
    .sort((a, b) => {
      const ta = sessaoDe(a) ? new Date(sessaoDe(a)!).getTime() : Number.POSITIVE_INFINITY;
      const tb = sessaoDe(b) ? new Date(sessaoDe(b)!).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });

  return (
    <AppLayout
      titulo="Aprovação da diretoria"
      descricao="Decisão de participação, observações, pedidos de resposta e arquivos de análise"
    >
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.valor}
            size="sm"
            variant={filtro === f.valor ? "default" : "outline"}
            onClick={() => setFiltro(f.valor)}
          >
            {f.label}
            <span className="ml-2 rounded-full bg-background/20 px-1.5 text-[11px]">
              {contagem[f.valor]}
            </span>
          </Button>
        ))}
      </div>

      {!podeAprovar && (
        <p className="mt-4 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
          Somente a diretoria e administradores podem aprovar, reprovar ou pedir resposta. Você pode consultar as
          decisões, responder o que a diretoria pediu e anexar arquivos de análise.
        </p>
      )}

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Carregando licitações…</p>}

      {!isLoading && lista.length === 0 && (
        <div className="surface-panel mt-5 p-6 text-sm text-muted-foreground">
          Nenhuma licitação nesta situação.
        </div>
      )}

      <div className="mt-5 space-y-4">
        {lista.map((l) => (
          <CardAprovacao
            key={l.id}
            licitacao={l}
            sessao={sessaoDe(l)}
            equipeId={equipeId}
            podeDecidir={podeAprovar}
            salvando={salvarObs.isPending || decidir.isPending || pedirResposta.isPending}
            onDecidir={(status) => decidir.mutate({ licitacao: l, status })}
            onSalvarObs={(observacao) => salvarObs.mutate({ id: l.id, observacao })}
            onPedirResposta={(solicitar) => pedirResposta.mutate({ licitacao: l, solicitar })}
            onResponder={(resposta) => responder.mutate({ licitacao: l, resposta })}
            respondendo={responder.isPending}
          />
        ))}
      </div>
    </AppLayout>
  );
}

function CardAprovacao({
  licitacao: l,
  sessao,
  equipeId,
  podeDecidir,
  salvando,
  respondendo,
  onDecidir,
  onSalvarObs,
  onPedirResposta,
  onResponder,
}: {
  licitacao: any;
  sessao: string | null;
  equipeId: string | null;
  podeDecidir: boolean;
  salvando: boolean;
  respondendo: boolean;
  onDecidir: (status: "pendente" | "aprovada" | "reprovada") => void;
  onSalvarObs: (observacao: string) => void;
  onPedirResposta: (solicitar: boolean) => void;
  onResponder: (resposta: string) => void;
}) {
  const [obs, setObs] = useState<string>(l.aprovacao_observacao ?? "");
  const [resposta, setResposta] = useState<string>(l.aprovacao_resposta ?? "");
  useEffect(() => setObs(l.aprovacao_observacao ?? ""), [l.aprovacao_observacao]);
  useEffect(() => setResposta(l.aprovacao_resposta ?? ""), [l.aprovacao_resposta]);

  const status: string = l.aprovacao_status ?? "pendente";
  const pedido = Boolean(l.aprovacao_resposta_solicitada);

  return (
    <article className="surface-panel overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 bg-[hsl(var(--sidebar-background))] px-4 py-3 text-sidebar-foreground">
        <p className="font-display text-sm font-semibold">
          {l.modalidade ?? "Licitação"}
          {l.numero ? ` nº ${l.numero}` : ""}
        </p>
        <span className="text-xs text-sidebar-foreground/75">
          {[l.cidade, l.uf].filter(Boolean).join("/") || "Local não informado"}
        </span>
        {pedido && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
            Aguardando nossa resposta
          </span>
        )}
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold",
            status === "aprovada" && "bg-emerald-600 text-white",
            status === "reprovada" && "bg-destructive text-destructive-foreground",
            status === "pendente" && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          {status === "aprovada" ? "Aprovada" : status === "reprovada" ? "Reprovada" : "Aguardando"}
        </span>
      </header>

      <div className="space-y-3 p-4">
        <p className="text-sm font-medium uppercase">{l.orgao ?? "Órgão não informado"}</p>
        <p className="text-sm text-muted-foreground">{l.objeto ?? "Objeto não informado"}</p>

        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <p>
            <span className="font-semibold text-foreground">Sessão: </span>
            {sessao ? dataHora(sessao) : "—"}
          </p>
          <p>
            <span className="font-semibold text-foreground">Valor estimado: </span>
            {l.valor_estimado != null ? moeda(l.valor_estimado) : "não informado"}
          </p>
          <p>
            <span className="font-semibold text-foreground">Situação: </span>
            {l.status ?? "—"}
          </p>
        </div>

        {l.qualificacao_tecnica && (
          <p className="whitespace-pre-line rounded-md bg-muted/60 p-3 text-xs text-primary">
            <span className="font-semibold">Qualificação técnica: </span>
            {l.qualificacao_tecnica}
          </p>
        )}

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Observação da diretoria
          </label>
          <Textarea
            className="mt-1"
            rows={3}
            value={obs}
            readOnly={!podeDecidir}
            placeholder="Ex.: aprovado com limite de desconto de 12%; confirmar atestado de piso intertravado."
            onChange={(e) => setObs(e.target.value)}
            onBlur={() => {
              if (podeDecidir && (l.aprovacao_observacao ?? "") !== obs) onSalvarObs(obs);
            }}
          />
        </div>

        {(pedido || l.aprovacao_resposta) && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {pedido ? "A diretoria pediu uma resposta sobre a observação" : "Nossa resposta"}
            </p>
            <Textarea
              className="mt-2"
              rows={3}
              value={resposta}
              placeholder="Escreva aqui a resposta da equipe para a diretoria."
              onChange={(e) => setResposta(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={respondendo || !resposta.trim()}
                onClick={() => onResponder(resposta)}
              >
                Enviar resposta à diretoria
              </Button>
              {l.aprovacao_resposta_em && (
                <p className="text-xs text-muted-foreground">
                  Respondido por {l.aprovacao_resposta_autor_nome ?? "usuário"} em{" "}
                  {dataHora(l.aprovacao_resposta_em)}
                </p>
              )}
            </div>
          </div>
        )}

        <Anexos licitacaoId={l.id} equipeId={equipeId} />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!podeDecidir || salvando || status === "aprovada"}
            onClick={() => onDecidir("aprovada")}
          >
            <Check className="mr-2 h-4 w-4" /> Aprovar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!podeDecidir || salvando || status === "reprovada"}
            onClick={() => onDecidir("reprovada")}
          >
            <X className="mr-2 h-4 w-4" /> Não aprovar
          </Button>
          <Button
            size="sm"
            variant={pedido ? "secondary" : "outline"}
            disabled={!podeDecidir || salvando}
            onClick={() => onPedirResposta(!pedido)}
          >
            <MessageSquareWarning className="mr-2 h-4 w-4" />
            {pedido ? "Cancelar pedido de resposta" : "Analisar observação"}
          </Button>
          {status !== "pendente" && (
            <Button
              size="sm"
              variant="outline"
              disabled={!podeDecidir || salvando}
              onClick={() => onDecidir("pendente")}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Voltar para análise
            </Button>
          )}
          {l.aprovacao_em && (
            <p className="text-xs text-muted-foreground">
              Decidido por {l.aprovacao_autor_nome ?? "usuário"} em {dataHora(l.aprovacao_em)}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function Anexos({ licitacaoId, equipeId }: { licitacaoId: string; equipeId: string | null }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const { data: arquivos } = useQuery({
    queryKey: ["aprovacao-anexos", licitacaoId],
    enabled: Boolean(equipeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentos")
        .select("*")
        .eq("licitacao_id", licitacaoId)
        .eq("tipo", "aprovacao")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const recarregar = () =>
    void queryClient.invalidateQueries({ queryKey: ["aprovacao-anexos", licitacaoId] });

  const enviar = async (files: FileList | null) => {
    if (!files?.length || !equipeId) return;
    setEnviando(true);
    try {
      for (const file of Array.from(files)) {
        const limpo = file.name.replace(/[^\w.\-() ]+/g, "_");
        const caminho = `${equipeId}/aprovacao/${licitacaoId}/${Date.now()}-${limpo}`;
        const { error: erroUpload } = await supabase.storage
          .from("documentos")
          .upload(caminho, file, { upsert: false });
        if (erroUpload) throw erroUpload;
        const { error } = await supabase.from("documentos").insert({
          licitacao_id: licitacaoId,
          equipe_id: equipeId,
          tipo: "aprovacao",
          nome: file.name,
          storage_path: caminho,
        });
        if (error) throw error;
      }
      toast.success("Arquivo anexado para análise da diretoria.");
      recarregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível anexar o arquivo.");
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const abrir = async (doc: any) => {
    if (doc.url) {
      window.open(doc.url, "_blank", "noreferrer");
      return;
    }
    const { data, error } = await supabase.storage
      .from("documentos")
      .createSignedUrl(doc.storage_path, 300);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o arquivo.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noreferrer");
  };

  const remover = async (doc: any) => {
    if (doc.storage_path) await supabase.storage.from("documentos").remove([doc.storage_path]);
    const { error } = await supabase.from("documentos").delete().eq("id", doc.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Arquivo removido.");
    recarregar();
  };

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Arquivos para análise (orçamento, composição, planilhas, PDFs)
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={enviando}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="mr-2 h-4 w-4" />
          {enviando ? "Enviando…" : "Anexar arquivo"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void enviar(e.target.files)}
        />
      </div>

      {(arquivos ?? []).length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Nenhum arquivo anexado. Envie o orçamento em Excel, a composição em PDF ou qualquer
          documento que ajude na aprovação.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {(arquivos ?? []).map((doc) => (
            <li key={doc.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{doc.nome}</span>
              <Button size="sm" variant="ghost" onClick={() => void abrir(doc)}>
                <Download className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void remover(doc)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
