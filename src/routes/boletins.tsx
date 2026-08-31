import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { corDoStatus, data as fData, dataHora, moeda } from "@/lib/formato";

export const Route = createFileRoute("/boletins")({
  head: () => ({
    meta: [
      { title: "Boletins de novas licitações - Licitações Cetro" },
      {
        name: "description",
        content:
          "Boletim diário das licitações incluídas no acompanhamento que ainda não foram vistas pela equipe, agrupadas por dia.",
      },
      { property: "og:title", content: "Boletins de novas licitações - Licitações Cetro" },
      {
        property: "og:description",
        content: "Resumo periódico das licitações novas e ainda não visualizadas pela equipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Boletins,
});

const PERIODOS = [
  { valor: "1", rotulo: "Hoje" },
  { valor: "7", rotulo: "7 dias" },
  { valor: "30", rotulo: "30 dias" },
] as const;

function Boletins() {
  const { equipeId, user, perfil } = useAuth();
  const qc = useQueryClient();
  const [dias, setDias] = useState<string>("7");
  const [somenteNaoVistas, setSomenteNaoVistas] = useState(true);

  const { data: licitacoes, isLoading } = useQuery({
    queryKey: ["boletim-licitacoes", equipeId, dias],
    enabled: Boolean(equipeId),
    queryFn: async () => {
      const desde = new Date(Date.now() - Number(dias) * 86400000).toISOString();
      const { data } = await supabase
        .from("licitacoes")
        .select("*")
        .gte("created_at", desde)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: vistas } = useQuery({
    queryKey: ["visualizacoes-boletim", equipeId],
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

  const euVi = (id: string) =>
    (vistas ?? []).some((v: any) => v.licitacao_id === id && v.user_id === user?.id);
  const vistaPor = (id: string) =>
    (vistas ?? [])
      .filter((v: any) => v.licitacao_id === id)
      .map((v: any) => v.user_nome ?? "membro");

  const marcar = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!user || !equipeId || ids.length === 0) return;
      const novos = ids.filter((id) => !euVi(id));
      if (novos.length === 0) return;
      const { error } = await supabase.from("visualizacoes").insert(
        novos.map((id) => ({
          equipe_id: equipeId,
          user_id: user.id,
          user_nome: perfil?.nome ?? perfil?.email ?? "membro",
          licitacao_id: id,
        })),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["visualizacoes-boletim"] });
      void qc.invalidateQueries({ queryKey: ["visualizacoes-licitacoes"] });
    },
    onError: () => toast.error("Não foi possível marcar as licitações como vistas."),
  });

  const grupos = useMemo(() => {
    const lista = (licitacoes ?? []).filter((l: any) => !somenteNaoVistas || !euVi(l.id));
    const mapa = new Map<string, any[]>();
    for (const l of lista) {
      const dia = String(l.created_at).slice(0, 10);
      mapa.set(dia, [...(mapa.get(dia) ?? []), l]);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [licitacoes, vistas, somenteNaoVistas, user?.id]);

  const total = grupos.reduce((s, [, l]) => s + l.length, 0);

  return (
    <AppLayout
      titulo="Boletins"
      descricao="Resumo diário das licitações novas que a equipe ainda não visualizou"
      acoes={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSomenteNaoVistas((v) => !v)}
          >
            {somenteNaoVistas ? "Mostrar todas" : "Somente não vistas"}
          </Button>
          <Button
            size="sm"
            disabled={total === 0}
            onClick={() => marcar.mutate(grupos.flatMap(([, l]) => l.map((x: any) => x.id)))}
          >
            <Check className="mr-2 h-4 w-4" /> Marcar boletim como lido
          </Button>
        </>
      }
    >
      <Tabs value={dias} onValueChange={setDias} className="mb-4">
        <TabsList>
          {PERIODOS.map((p) => (
            <TabsTrigger key={p.valor} value={p.valor}>
              {p.rotulo}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando boletim…</p>}

      <div className="space-y-5">
        {grupos.map(([dia, itens]) => (
          <section key={dia} className="surface-panel">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
              <div>
                <h2 className="font-display text-sm font-semibold">
                  Boletim de {fData(`${dia}T12:00:00`)}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {itens.length} licitação(ões) incluída(s) neste dia
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => marcar.mutate(itens.map((l: any) => l.id))}
              >
                Marcar dia como lido
              </Button>
            </div>
            <ul className="divide-y">
              {itens.map((l: any) => (
                <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/licitacoes/$id"
                        params={{ id: l.id }}
                        className="font-medium hover:underline"
                      >
                        {l.numero}
                      </Link>
                      <Badge variant="outline" className={corDoStatus(l.status)}>
                        {l.status}
                      </Badge>
                      {l.portal && <Badge variant="secondary">{l.portal}</Badge>}
                      {euVi(l.id) && <Badge variant="outline">vista por você</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground">
                      {l.objeto}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {l.orgao ?? "—"} · {l.cidade ?? "—"}/{l.uf ?? "—"} ·{" "}
                      {moeda(l.valor_estimado)} · sessão {dataHora(l.data_sessao)}
                      {vistaPor(l.id).length > 0 && ` · vista por ${vistaPor(l.id).join(", ")}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {l.site_url && (
                      <Button variant="secondary" size="sm" asChild>
                        <a href={l.site_url} target="_blank" rel="noreferrer">
                          Site <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    )}
                    {!euVi(l.id) && (
                      <Button variant="outline" size="sm" onClick={() => marcar.mutate([l.id])}>
                        <Check className="mr-1 h-3 w-3" /> Vista
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {!isLoading && grupos.length === 0 && (
          <div className="surface-panel p-10 text-center text-sm text-muted-foreground">
            Nenhuma licitação nova no período. Importe novas licitações na aba Pesquisa para
            alimentar o boletim.
          </div>
        )}
      </div>
    </AppLayout>
  );
}
