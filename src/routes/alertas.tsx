import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BellRing, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dataHora } from "@/lib/formato";

export const Route = createFileRoute("/alertas")({
  head: () => ({
    meta: [
      { title: "Alertas e notificações - Licitações Cetro" },
      {
        name: "description",
        content:
          "Avisos de novas licitações, mudanças de status, retificações, prazos próximos e movimentações da equipe.",
      },
      { property: "og:title", content: "Alertas e notificações - Licitações Cetro" },
      {
        property: "og:description",
        content: "Central de avisos das licitações acompanhadas pela equipe.",
      },
    ],
  }),
  component: Alertas,
});

function Alertas() {
  const { equipeId } = useAuth();
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<"todos" | "nao_lidos">("nao_lidos");

  const { data } = useQuery({
    queryKey: ["alertas", filtro],
    enabled: Boolean(equipeId),
    queryFn: async () => {
      let q = supabase
        .from("alertas")
        .select("*,licitacoes(numero,orgao)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filtro === "nao_lidos") q = q.eq("lida", false);
      const { data } = await q;
      return data ?? [];
    },
  });

  const marcar = useMutation({
    mutationFn: async (id?: string) => {
      const q = supabase.from("alertas").update({ lida: true });
      const { error } = id ? await q.eq("id", id) : await q.eq("lida", false);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["alertas"] });
      void qc.invalidateQueries({ queryKey: ["alertas-nao-lidos"] });
    },
  });

  const alertas = data ?? [];

  return (
    <AppLayout
      titulo="Alertas"
      descricao="Avisos automáticos de novas licitações, prazos e movimentações"
      acoes={
        <Button variant="outline" size="sm" onClick={() => marcar.mutate(undefined)}>
          <CheckCheck className="mr-2 h-4 w-4" /> Marcar todos como lidos
        </Button>
      }
    >
      <div className="mb-4 flex gap-2">
        {(["nao_lidos", "todos"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filtro === f ? "default" : "outline"}
            onClick={() => setFiltro(f)}
          >
            {f === "nao_lidos" ? "Não lidos" : "Todos"}
          </Button>
        ))}
      </div>

      <div className="surface-panel divide-y">
        {alertas.map((a: any) => (
          <div key={a.id} className="flex flex-wrap items-start gap-3 p-4">
            <BellRing
              className={`mt-0.5 h-4 w-4 shrink-0 ${a.lida ? "text-muted-foreground" : "text-primary"}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{a.titulo}</span>
                <Badge variant="outline">{a.tipo}</Badge>
                {!a.lida && <Badge>novo</Badge>}
              </div>
              {a.mensagem && <p className="mt-1 text-sm text-muted-foreground">{a.mensagem}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {dataHora(a.created_at)}
                {a.licitacoes?.numero ? ` · ${a.licitacoes.numero} — ${a.licitacoes.orgao ?? ""}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              {a.licitacao_id && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/licitacoes/$id" params={{ id: a.licitacao_id }}>Abrir</Link>
                </Button>
              )}
              {!a.lida && (
                <Button variant="ghost" size="sm" onClick={() => marcar.mutate(a.id)}>
                  Marcar lida
                </Button>
              )}
            </div>
          </div>
        ))}
        {alertas.length === 0 && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhum alerta {filtro === "nao_lidos" ? "não lida" : "registrado"}.
          </p>
        )}
      </div>
    </AppLayout>
  );
}
