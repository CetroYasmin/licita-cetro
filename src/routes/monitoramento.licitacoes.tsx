import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { definirMonitoramento } from "@/services/monitoring/monitoring.functions";
import { useMonitorRealtime } from "@/hooks/useMonitorRealtime";
import { useMonitorWorker } from "@/hooks/useMonitorWorker";
import { dataHora } from "@/lib/formato";

export const Route = createFileRoute("/monitoramento/licitacoes")({
  head: () => ({
    meta: [
      { title: "Minhas licitações monitoradas - Licitações Cetro" },
      {
        name: "description",
        content:
          "Lista das licitações acompanhadas: órgão, número, portal, objeto, situação, última mensagem do chat e status do monitoramento.",
      },
      { property: "og:title", content: "Minhas licitações monitoradas - Licitações Cetro" },
      {
        property: "og:description",
        content: "Ligue ou desligue o monitoramento do chat de cada pregão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinhasLicitacoes,
});

function MinhasLicitacoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const alternar = useServerFn(definirMonitoramento);
  useMonitorWorker({ ativo: Boolean(user) });
  useMonitorRealtime();

  const { data } = useQuery({
    queryKey: ["monitor", "licitacoes", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const [{ data: pregoes }, { data: monits }, { data: msgs }] = await Promise.all([
        supabase
          .from("pregoes")
          .select("*, portais(nome, slug)")
          .order("created_at", { ascending: false }),
        supabase.from("monitoramentos").select("pregao_id, ativo"),
        supabase
          .from("pregao_mensagens")
          .select("pregao_id, mensagem, mensagem_em")
          .order("mensagem_em", { ascending: false })
          .limit(500),
      ]);
      const ativos = new Map((monits ?? []).map((m) => [m.pregao_id, m.ativo]));
      const ultima = new Map<string, { mensagem: string; mensagem_em: string }>();
      for (const m of msgs ?? []) if (!ultima.has(m.pregao_id)) ultima.set(m.pregao_id, m);
      return (pregoes ?? []).map((p: any) => ({
        ...p,
        monitorando: ativos.get(p.id) ?? false,
        ultima: ultima.get(p.id) ?? null,
      }));
    },
  });

  const mutar = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) =>
      alternar({ data: { pregao_id: id, ativo } }),
    onSuccess: (_r, v) => {
      toast.success(v.ativo ? "Monitoramento ativado" : "Monitoramento desativado");
      void qc.invalidateQueries({ queryKey: ["monitor"] });
    },
    onError: () => toast.error("Não foi possível alterar o monitoramento"),
  });

  const pregoes = data ?? [];

  return (
    <AppLayout
      titulo="Minhas licitações"
      descricao="Licitações disponíveis para monitoramento de chat"
      acoes={
        <Button variant="outline" size="sm" asChild>
          <Link to="/monitoramento">Painel</Link>
        </Button>
      }
    >
      <div className="surface-panel overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Órgão</th>
              <th className="p-3">Licitação</th>
              <th className="p-3">Portal</th>
              <th className="p-3">Objeto</th>
              <th className="p-3">Situação</th>
              <th className="p-3">Última mensagem</th>
              <th className="p-3">Monitorar</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {pregoes.map((p: any) => (
              <tr key={p.id}>
                <td className="p-3">{p.orgao ?? "—"}</td>
                <td className="p-3 font-medium">{p.titulo}</td>
                <td className="p-3">{p.portais?.nome ?? "—"}</td>
                <td className="max-w-[280px] p-3 text-muted-foreground">{p.objeto ?? "—"}</td>
                <td className="p-3">
                  <Badge variant="outline">{p.status}</Badge>
                </td>
                <td className="max-w-[260px] p-3">
                  {p.ultima ? (
                    <>
                      <p className="truncate">{p.ultima.mensagem}</p>
                      <p className="text-xs text-muted-foreground">{dataHora(p.ultima.mensagem_em)}</p>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3">
                  <Switch
                    checked={p.monitorando}
                    onCheckedChange={(v) => mutar.mutate({ id: p.id, ativo: v })}
                    aria-label="Alternar monitoramento"
                  />
                </td>
                <td className="p-3">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/monitoramento/chat/$id" params={{ id: p.id }}>
                      Abrir chat
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
            {pregoes.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-muted-foreground">
                  Nenhuma licitação disponível para monitoramento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
