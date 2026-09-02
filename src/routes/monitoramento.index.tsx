import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bell, KeyRound, MessageSquare, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMonitorRealtime } from "@/hooks/useMonitorRealtime";
import { useMonitorWorker } from "@/hooks/useMonitorWorker";
import { dataHora } from "@/lib/formato";

export const Route = createFileRoute("/monitoramento/")({
  head: () => ({
    meta: [
      { title: "Monitoramento de chats - Licitações Cetro" },
      {
        name: "description",
        content:
          "Painel do monitoramento de chats de pregões: licitações acompanhadas, mensagens novas, alertas de palavras-chave e portais conectados.",
      },
      { property: "og:title", content: "Monitoramento de chats - Licitações Cetro" },
      {
        property: "og:description",
        content: "Acompanhe em tempo real as mensagens dos chats dos pregões monitorados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PainelMonitoramento,
});

function PainelMonitoramento() {
  const { user } = useAuth();
  useMonitorWorker({ ativo: Boolean(user) });
  useMonitorRealtime();

  const { data } = useQuery({
    queryKey: ["monitor", "painel", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const [monit, msgs, notif, palavras, portais] = await Promise.all([
        supabase.from("monitoramentos").select("id, ativo, pregao_id, pregoes(id, titulo, orgao, status)"),
        supabase
          .from("pregao_mensagens")
          .select("id, mensagem, autor, mensagem_em, pregao_id, pregoes(titulo)")
          .order("mensagem_em", { ascending: false })
          .limit(8),
        supabase
          .from("notificacoes")
          .select("id, titulo, corpo, palavra, lida, created_at, pregao_id")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase.from("palavras_chave").select("id").eq("ativo", true),
        supabase.from("portais").select("id, nome, ativo, connector_type"),
      ]);
      return {
        monitoramentos: monit.data ?? [],
        mensagens: msgs.data ?? [],
        notificacoes: notif.data ?? [],
        palavras: palavras.data?.length ?? 0,
        portais: portais.data ?? [],
      };
    },
  });

  const monitoramentos = data?.monitoramentos ?? [];
  const ativos = monitoramentos.filter((m) => m.ativo);
  const naoLidas = (data?.notificacoes ?? []).filter((n) => !n.lida);

  const cards = [
    { label: "Licitações monitoradas", valor: monitoramentos.length, icone: Activity },
    { label: "Monitoramentos ativos", valor: ativos.length, icone: Radio },
    { label: "Mensagens recentes", valor: data?.mensagens.length ?? 0, icone: MessageSquare },
    { label: "Alertas não lidos", valor: naoLidas.length, icone: Bell },
    { label: "Palavras-chave ativas", valor: data?.palavras ?? 0, icone: KeyRound },
  ];

  return (
    <AppLayout
      titulo="Monitoramento de chats"
      descricao="Portais conectados por connectors independentes, com coleta, normalização e alertas automáticos"
      acoes={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to="/monitoramento/palavras">Palavras-chave</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/monitoramento/licitacoes">Minhas licitações</Link>
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="surface-panel p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <c.icone className="h-4 w-4" />
              {c.label}
            </div>
            <p className="mt-2 font-display text-2xl font-semibold">{c.valor}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="surface-panel">
          <h2 className="border-b p-4 font-display text-sm font-semibold">Mensagens recentes</h2>
          <ul className="divide-y">
            {(data?.mensagens ?? []).map((m: any) => (
              <li key={m.id} className="p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.autor}</span>
                  <span className="text-xs text-muted-foreground">{dataHora(m.mensagem_em)}</span>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/monitoramento/chat/$id" params={{ id: m.pregao_id }}>
                      {m.pregoes?.titulo ?? "Abrir chat"}
                    </Link>
                  </Button>
                </div>
                <p className="mt-1 text-muted-foreground">{m.mensagem}</p>
              </li>
            ))}
            {(data?.mensagens.length ?? 0) === 0 && (
              <li className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma mensagem coletada. Ative o monitoramento de uma licitação.
              </li>
            )}
          </ul>
        </div>

        <div className="surface-panel">
          <h2 className="border-b p-4 font-display text-sm font-semibold">Alertas de palavras-chave</h2>
          <ul className="divide-y">
            {(data?.notificacoes ?? []).map((n: any) => (
              <li key={n.id} className="p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <span className="font-medium">{n.titulo}</span>
                  {!n.lida && <Badge>novo</Badge>}
                </div>
                <p className="mt-1 text-muted-foreground">{n.corpo}</p>
                {n.palavra && (
                  <p className="mt-1 text-xs uppercase text-primary">Palavra-chave: {n.palavra}</p>
                )}
              </li>
            ))}
            {(data?.notificacoes.length ?? 0) === 0 && (
              <li className="p-8 text-center text-sm text-muted-foreground">
                Nenhum alerta ainda. Cadastre palavras-chave para ser avisado.
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="surface-panel mt-4 p-4">
        <h2 className="font-display text-sm font-semibold">Portais conectados</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(data?.portais ?? []).map((p: any) => (
            <Badge key={p.id} variant={p.ativo ? "default" : "outline"}>
              {p.nome} · {p.ativo ? "conector ativo" : "conector pendente"}
            </Badge>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
