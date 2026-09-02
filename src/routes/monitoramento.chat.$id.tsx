import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { Bell, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { definirMonitoramento } from "@/services/monitoring/monitoring.functions";
import { useMonitorRealtime } from "@/hooks/useMonitorRealtime";
import { useMonitorWorker } from "@/hooks/useMonitorWorker";
import { combinarPalavras } from "@/services/monitoring/keywords";
import { dataHora } from "@/lib/formato";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/monitoramento/chat/$id")({
  head: () => ({
    meta: [
      { title: "Chat do pregão - Licitações Cetro" },
      {
        name: "description",
        content:
          "Chat do pregão em tempo real: mensagens do pregoeiro, do sistema e dos licitantes, com destaque das palavras-chave cadastradas.",
      },
      { property: "og:title", content: "Chat do pregão - Licitações Cetro" },
      {
        property: "og:description",
        content: "Mensagens do chat da sessão coletadas automaticamente pelo conector do portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPregao,
});

const COR_TIPO: Record<string, string> = {
  pregoeiro: "bg-primary/10 text-primary",
  sistema: "bg-muted text-muted-foreground",
  equipe: "bg-secondary/15 text-secondary",
  licitante: "bg-accent text-accent-foreground",
};

function ChatPregao() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const alternar = useServerFn(definirMonitoramento);
  const fim = useRef<HTMLDivElement>(null);

  useMonitorWorker({ pregaoId: id, ativo: Boolean(user) });
  useMonitorRealtime();

  const { data } = useQuery({
    queryKey: ["monitor", "chat", id],
    enabled: Boolean(user),
    queryFn: async () => {
      const [{ data: pregao }, { data: mensagens }, { data: monit }, { data: palavras }] =
        await Promise.all([
          supabase.from("pregoes").select("*, portais(nome, slug, base_url)").eq("id", id).maybeSingle(),
          supabase
            .from("pregao_mensagens")
            .select("*")
            .eq("pregao_id", id)
            .order("mensagem_em", { ascending: true })
            .limit(500),
          supabase.from("monitoramentos").select("ativo").eq("pregao_id", id).maybeSingle(),
          supabase.from("palavras_chave").select("palavra").eq("ativo", true),
        ]);
      return {
        pregao,
        mensagens: mensagens ?? [],
        monitorando: monit?.ativo ?? false,
        palavras: (palavras ?? []).map((p) => p.palavra),
      };
    },
  });

  const mutar = useMutation({
    mutationFn: async (ativo: boolean) => alternar({ data: { pregao_id: id, ativo } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["monitor"] }),
  });

  const mensagens = data?.mensagens ?? [];

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length]);

  const pregao = data?.pregao as any;

  return (
    <AppLayout
      titulo={pregao?.titulo ?? "Chat do pregão"}
      descricao={`${pregao?.orgao ?? ""} · ${pregao?.portais?.nome ?? "portal"}`}
      acoes={
        <>
          <Badge variant={data?.monitorando ? "default" : "outline"} className="gap-1">
            <Radio className={data?.monitorando ? "h-3 w-3 animate-pulse" : "h-3 w-3"} />
            {data?.monitorando ? "Coletando ao vivo" : "Monitoramento desligado"}
          </Badge>
          <Switch
            checked={data?.monitorando ?? false}
            onCheckedChange={(v) => mutar.mutate(v)}
            aria-label="Alternar monitoramento"
          />
          <Button variant="outline" size="sm" asChild>
            <Link to="/monitoramento/licitacoes">Minhas licitações</Link>
          </Button>
        </>
      }
    >
      <div className="surface-panel mx-auto flex max-w-3xl flex-col">
        <div className="border-b p-4">
          <p className="font-display text-sm font-semibold">{pregao?.titulo ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {pregao?.orgao ?? "—"} · {pregao?.status ?? "—"} · {pregao?.external_id}
          </p>
        </div>

        <div className="max-h-[60vh] min-h-[320px] space-y-4 overflow-y-auto p-4">
          {mensagens.map((m: any) => {
            const achadas = combinarPalavras(m.mensagem, data?.palavras ?? []);
            return (
              <div key={m.id} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{dataHora(m.mensagem_em)}</span>
                  <span className="font-medium text-foreground">{m.autor}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px]", COR_TIPO[m.autor_tipo] ?? COR_TIPO["licitante"])}>
                    {m.autor_tipo}
                  </span>
                </div>
                <p
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm",
                    achadas.length > 0 ? "border-primary/40 bg-primary/5" : "bg-card",
                  )}
                >
                  {m.mensagem}
                </p>
                {achadas.length > 0 && (
                  <p className="flex items-center gap-1 text-xs font-medium text-primary">
                    <Bell className="h-3 w-3" /> Palavra-chave encontrada: {achadas.join(", ")}
                  </p>
                )}
              </div>
            );
          })}
          {mensagens.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma mensagem coletada ainda. Ative o monitoramento e aguarde alguns segundos.
            </p>
          )}
          <div ref={fim} />
        </div>
      </div>
    </AppLayout>
  );
}
