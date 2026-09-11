import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { dataHora, moeda } from "@/lib/formato";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/aprovacao")({
  head: () => ({
    meta: [
      { title: "Aprovação da diretoria - Licitações Cetro" },
      {
        name: "description",
        content:
          "Painel de aprovação da diretoria para as licitações em acompanhamento, com decisão e observações por processo.",
      },
      { property: "og:title", content: "Aprovação da diretoria - Licitações Cetro" },
      {
        property: "og:description",
        content: "Aprove ou reprove a participação em cada licitação e registre observações.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Aprovacao,
});

type Filtro = "pendente" | "aprovada" | "reprovada" | "todas";

const FILTROS: { valor: Filtro; label: string }[] = [
  { valor: "pendente", label: "Aguardando decisão" },
  { valor: "aprovada", label: "Aprovadas" },
  { valor: "reprovada", label: "Reprovadas" },
  { valor: "todas", label: "Todas" },
];

function Aprovacao() {
  const { equipeId, perfil, user } = useAuth();
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("pendente");

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

  const decidir = useMutation({
    mutationFn: async (input: {
      id: string;
      status: "pendente" | "aprovada" | "reprovada";
      observacao?: string | null;
    }) => {
      const { error } = await supabase
        .from("licitacoes")
        .update({
          aprovacao_status: input.status,
          ...(input.observacao !== undefined ? { aprovacao_observacao: input.observacao } : {}),
          aprovacao_autor_nome: perfil?.nome ?? perfil?.email ?? null,
          aprovacao_autor_id: user?.id ?? null,
          aprovacao_em: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["aprovacao-licitacoes"] });
    },
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
      void queryClient.invalidateQueries({ queryKey: ["aprovacao-licitacoes"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar a observação."),
  });

  const lics = data ?? [];
  const sessaoDe = (l: any): string | null => l.proximo_evento_data ?? l.data_sessao ?? null;

  const contagem = {
    pendente: lics.filter((l) => (l.aprovacao_status ?? "pendente") === "pendente").length,
    aprovada: lics.filter((l) => l.aprovacao_status === "aprovada").length,
    reprovada: lics.filter((l) => l.aprovacao_status === "reprovada").length,
    todas: lics.length,
  };

  const lista = lics
    .filter((l) => (filtro === "todas" ? true : (l.aprovacao_status ?? "pendente") === filtro))
    .sort((a, b) => {
      const ta = sessaoDe(a) ? new Date(sessaoDe(a)!).getTime() : Number.POSITIVE_INFINITY;
      const tb = sessaoDe(b) ? new Date(sessaoDe(b)!).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });

  return (
    <AppLayout
      titulo="Aprovação da diretoria"
      descricao="Decisão de participação e observações da diretoria por licitação"
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
            salvando={salvarObs.isPending || decidir.isPending}
            onDecidir={(status) => decidir.mutate({ id: l.id, status })}
            onSalvarObs={(observacao) => salvarObs.mutate({ id: l.id, observacao })}
          />
        ))}
      </div>
    </AppLayout>
  );
}

function CardAprovacao({
  licitacao: l,
  sessao,
  salvando,
  onDecidir,
  onSalvarObs,
}: {
  licitacao: any;
  sessao: string | null;
  salvando: boolean;
  onDecidir: (status: "pendente" | "aprovada" | "reprovada") => void;
  onSalvarObs: (observacao: string) => void;
}) {
  const [obs, setObs] = useState<string>(l.aprovacao_observacao ?? "");
  useEffect(() => setObs(l.aprovacao_observacao ?? ""), [l.aprovacao_observacao]);

  const status: string = l.aprovacao_status ?? "pendente";

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
            placeholder="Ex.: aprovado com limite de desconto de 12%; confirmar atestado de piso intertravado."
            onChange={(e) => setObs(e.target.value)}
            onBlur={() => {
              if ((l.aprovacao_observacao ?? "") !== obs) onSalvarObs(obs);
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={salvando || status === "aprovada"}
            onClick={() => onDecidir("aprovada")}
          >
            <Check className="mr-2 h-4 w-4" /> Aprovar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={salvando || status === "reprovada"}
            onClick={() => onDecidir("reprovada")}
          >
            <X className="mr-2 h-4 w-4" /> Não aprovar
          </Button>
          {status !== "pendente" && (
            <Button
              size="sm"
              variant="outline"
              disabled={salvando}
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
