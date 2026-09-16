import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LICITACAO, corDoStatus, dataHora, moeda } from "@/lib/formato";
import { combina } from "@/lib/busca";
import {
  EditarSessaoValor,
  sessaoDeLicitacao,
  sessaoJaOcorreu,
} from "@/components/EditarSessaoValor";

export const Route = createFileRoute("/em-andamento")({
  head: () => ({
    meta: [
      { title: "Licitações em andamento - Licitações Cetro" },
      {
        name: "description",
        content:
          "Licitações cuja sessão de disputa já ocorreu, para acompanhamento do resultado, recursos e homologação.",
      },
      { property: "og:title", content: "Licitações em andamento - Licitações Cetro" },
      {
        property: "og:description",
        content: "Acompanhe o andamento das licitações já realizadas pela sua equipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmAndamento,
});

function EmAndamento() {
  const { equipeId } = useAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");

  const { data: licitacoes, isLoading } = useQuery({
    queryKey: ["em-andamento", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () => (await supabase.from("licitacoes").select("*")).data ?? [],
  });

  const atualizarStatus = useMutation({
    mutationFn: async ({ id, valor }: { id: string; valor: string }) => {
      const { error } = await supabase.from("licitacoes").update({ status: valor }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Situação atualizada.");
      void qc.invalidateQueries({ queryKey: ["em-andamento"] });
      void qc.invalidateQueries({ queryKey: ["licitacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lista = useMemo(() => {
    return (licitacoes ?? [])
      .filter((l: any) => sessaoJaOcorreu(l))
      .filter((l: any) => {
        const texto = `${l.numero} ${l.orgao ?? ""} ${l.objeto ?? ""}`;
        if (!combina(texto, busca)) return false;
        if (status !== "todos" && l.status !== status) return false;
        return true;
      })
      .sort((a: any, b: any) => {
        const ta = new Date(sessaoDeLicitacao(a) ?? 0).getTime();
        const tb = new Date(sessaoDeLicitacao(b) ?? 0).getTime();
        return tb - ta;
      });
  }, [licitacoes, busca, status]);

  return (
    <AppLayout
      titulo="Em andamento"
      descricao={`${lista.length} licitação(ões) com sessão já realizada`}
    >
      <div className="space-y-4">
        <div className="surface-panel grid gap-3 p-4 md:grid-cols-3">
          <div className="space-y-1 md:col-span-2">
            <Label>Busca por número, órgão ou objeto</Label>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="ex.: pavimentação" />
          </div>
          <div className="space-y-1">
            <Label>Situação</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {STATUS_LICITACAO.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : lista.length === 0 ? (
          <div className="surface-panel p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma licitação já realizada por aqui. Quando a sessão de uma licitação passar da
              data, ela aparece nesta aba automaticamente.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {lista.map((l: any) => (
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
                      {l.resultado_final && <Badge variant="outline">{l.resultado_final}</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{l.objeto}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {l.orgao} · {l.cidade ?? "—"}/{l.uf ?? "—"} · Sessão realizada:{" "}
                      {dataHora(sessaoDeLicitacao(l))} · Portal: {l.portal ?? "—"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs">
                      <span>Estimado: <strong>{moeda(l.valor_estimado)}</strong></span>
                      <span>Nossa proposta: <strong>{moeda(l.valor_ofertado)}</strong></span>
                      <span>
                        Posição: <strong>{l.posicao_empresa ? `${l.posicao_empresa}º` : "—"}</strong>
                      </span>
                    </div>
                    <div className="mt-3">
                      <p className="mb-1 text-xs text-muted-foreground">
                        Se a licitação foi adiada, corrija a data para voltar ao acompanhamento.
                      </p>
                      <EditarSessaoValor licitacao={l} compacto />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Select value={l.status} onValueChange={(v) => atualizarStatus.mutate({ id: l.id, valor: v })}>
                      <SelectTrigger className="h-8 w-[190px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_LICITACAO.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {l.site_url && (
                      <Button variant="secondary" size="sm" asChild>
                        <a href={l.site_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1 h-3.5 w-3.5" /> Site da licitação
                        </a>
                      </Button>
                    )}
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
