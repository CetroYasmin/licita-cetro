import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Gavel,
  CalendarClock,
  Trophy,
  XCircle,
  Flame,
  Wallet,
  TrendingUp,
  Bell,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { contagemRegressiva, corDoStatus, dataHora, moeda } from "@/lib/formato";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard - Licitações Cetro" },
      {
        name: "description",
        content:
          "Painel com licitações em acompanhamento, sessões do dia, prazos, valor em disputa e resultados da sua empresa.",
      },
      { property: "og:title", content: "Dashboard - Licitações Cetro" },
      {
        property: "og:description",
        content: "Visão geral das licitações acompanhadas pela sua empresa.",
      },
    ],
  }),
  component: Dashboard,
});

type Lic = {
  id: string;
  numero: string;
  orgao: string | null;
  objeto: string | null;
  status: string;
  data_sessao: string | null;
  valor_estimado: number | null;
  valor_ofertado: number | null;
  posicao_empresa: number | null;
  proximo_evento: string | null;
  proximo_evento_data: string | null;
  portal: string | null;
  site_url: string | null;
};

function CardIndicador({
  label,
  valor,
  icon: Icon,
  cor,
  to,
  portais,
}: {
  label: string;
  valor: string | number;
  icon: typeof Gavel;
  cor: string;
  to?: string;
  portais?: Lic[];
}) {
  const conteudo = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className={`h-4 w-4 ${cor}`} />
      </div>
      <p className="mt-3 font-display text-2xl font-semibold">{valor}</p>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="surface-panel block p-5 transition-colors hover:bg-muted/60">
        {conteudo}
      </Link>
    );
  }

  if (portais) {
    const comLink = portais.filter((l) => l.site_url);
    if (comLink.length === 0) {
      return (
        <Link to="/licitacoes" className="surface-panel block p-5 transition-colors hover:bg-muted/60">
          {conteudo}
        </Link>
      );
    }
    if (comLink.length === 1) {
      return (
        <a
          href={comLink[0].site_url!}
          target="_blank"
          rel="noreferrer"
          className="surface-panel block p-5 transition-colors hover:bg-muted/60"
        >
          {conteudo}
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-secondary">
            Abrir {comLink[0].portal ?? "portal"} <ExternalLink className="h-3 w-3" />
          </p>
        </a>
      );
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="surface-panel block w-full p-5 text-left transition-colors hover:bg-muted/60">
          {conteudo}
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-secondary">
            Escolher portal <ExternalLink className="h-3 w-3" />
          </p>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-w-sm">
          {comLink.map((l) => (
            <DropdownMenuItem key={l.id} asChild>
              <a href={l.site_url!} target="_blank" rel="noreferrer">
                <span className="truncate">
                  {l.numero} · {l.portal ?? "portal"}
                </span>
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return <div className="surface-panel p-5">{conteudo}</div>;
}

function Dashboard() {
  const { equipeId } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () => {
      const [lic, prazos, alertas] = await Promise.all([
        supabase
          .from("licitacoes")
          .select(
            "id,numero,orgao,objeto,status,data_sessao,valor_estimado,valor_ofertado,posicao_empresa,proximo_evento,proximo_evento_data",
          )
          .order("data_sessao", { ascending: true }),
        supabase
          .from("prazos")
          .select("id,tipo,descricao,data_limite,licitacao_id,concluido")
          .eq("concluido", false)
          .gte("data_limite", new Date().toISOString())
          .order("data_limite", { ascending: true })
          .limit(8),
        supabase
          .from("alertas")
          .select("id,titulo,mensagem,tipo,created_at,licitacao_id")
          .eq("lida", false)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      return {
        licitacoes: (lic.data ?? []) as Lic[],
        prazos: prazos.data ?? [],
        alertas: alertas.data ?? [],
      };
    },
  });

  const licitacoes = data?.licitacoes ?? [];
  const hoje = new Date().toDateString();
  const sessoesHoje = licitacoes.filter(
    (l) => l.data_sessao && new Date(l.data_sessao).toDateString() === hoje,
  );
  const emDisputa = licitacoes.filter((l) => l.status === "em disputa");
  const vencidas = licitacoes.filter((l) => ["vencida", "homologada"].includes(l.status));
  const perdidas = licitacoes.filter((l) => ["perdida", "fracassada"].includes(l.status));
  const acompanhando = licitacoes.filter(
    (l) => !["encerrada", "perdida", "vencida", "homologada", "deserta", "fracassada"].includes(l.status),
  );
  const valorEmDisputa = emDisputa.reduce((s, l) => s + (l.valor_estimado ?? 0), 0);
  const valorPotencial = licitacoes
    .filter((l) => l.valor_ofertado != null && !["perdida", "fracassada"].includes(l.status))
    .reduce((s, l) => s + (l.valor_ofertado ?? 0), 0);

  const cards = [
    {
      label: "Em acompanhamento",
      valor: acompanhando.length,
      icon: Gavel,
      cor: "text-secondary",
      to: "/licitacoes",
    },
    {
      label: "Sessões hoje",
      valor: sessoesHoje.length,
      icon: CalendarClock,
      cor: "text-warning",
      portais: sessoesHoje,
    },
    {
      label: "Em disputa",
      valor: emDisputa.length,
      icon: Flame,
      cor: "text-primary",
      portais: emDisputa,
    },
    { label: "Licitações vencidas", valor: vencidas.length, icon: Trophy, cor: "text-success" },
    { label: "Licitações perdidas", valor: perdidas.length, icon: XCircle, cor: "text-destructive" },
    { label: "Valor total em disputa", valor: moeda(valorEmDisputa), icon: Wallet, cor: "text-secondary" },
    {
      label: "Valor potencial de contratos",
      valor: moeda(valorPotencial),
      icon: TrendingUp,
      cor: "text-success",
    },
  ];

  return (
    <AppLayout
      titulo="Dashboard"
      descricao="Resumo do acompanhamento das licitações da sua equipe"
      acoes={
        <Button asChild size="sm">
          <Link to="/pesquisa">Pesquisar licitações</Link>
        </Button>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando indicadores…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <CardIndicador
                key={c.label}
                label={c.label}
                valor={c.valor}
                icon={c.icon}
                cor={c.cor}
                to={"to" in c ? (c.to as string) : undefined}
                portais={"portais" in c ? (c.portais as Lic[]) : undefined}
              />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="surface-panel lg:col-span-2">
              <div className="flex items-center justify-between border-b p-4">
                <h2 className="text-sm font-semibold">Sessões e próximos eventos</h2>
                <Link to="/licitacoes" className="text-xs text-secondary hover:underline">
                  ver todas
                </Link>
              </div>
              <div className="divide-y">
                {acompanhando.slice(0, 8).map((l) => (
                  <Link
                    key={l.id}
                    to="/licitacoes/$id"
                    params={{ id: l.id }}
                    className="block p-4 transition-colors hover:bg-muted/60"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{l.numero}</span>
                      <Badge variant="outline" className={corDoStatus(l.status)}>
                        {l.status}
                      </Badge>
                      {l.posicao_empresa != null && (
                        <Badge variant="outline">{l.posicao_empresa}º lugar</Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{l.objeto}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {l.orgao} · Sessão: {dataHora(l.data_sessao)}{" "}
                      {l.data_sessao && `(${contagemRegressiva(l.data_sessao)})`}
                    </p>
                  </Link>
                ))}
                {acompanhando.length === 0 && (
                  <p className="p-6 text-sm text-muted-foreground">
                    Nenhuma licitação em acompanhamento. Comece pela tela de importação.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="surface-panel">
                <h2 className="border-b p-4 text-sm font-semibold">Próximos prazos</h2>
                <div className="divide-y">
                  {(data?.prazos ?? []).map((p) => (
                    <Link
                      key={p.id}
                      to="/licitacoes/$id"
                      params={{ id: p.licitacao_id }}
                      className="block p-3 text-sm hover:bg-muted/60"
                    >
                      <p className="font-medium">{p.tipo}</p>
                      <p className="text-xs text-muted-foreground">
                        {dataHora(p.data_limite)} · faltam {contagemRegressiva(p.data_limite)}
                      </p>
                    </Link>
                  ))}
                  {(data?.prazos ?? []).length === 0 && (
                    <p className="p-4 text-sm text-muted-foreground">Nenhum prazo aberto.</p>
                  )}
                </div>
              </div>

              <div className="surface-panel">
                <div className="flex items-center justify-between border-b p-4">
                  <h2 className="text-sm font-semibold">Alertas recentes</h2>
                  <Bell className="h-4 w-4 text-primary" />
                </div>
                <div className="divide-y">
                  {(data?.alertas ?? []).map((a) => (
                    <div key={a.id} className="p-3">
                      <p className="text-sm font-medium">{a.titulo}</p>
                      <p className="text-xs text-muted-foreground">{a.mensagem}</p>
                    </div>
                  ))}
                  {(data?.alertas ?? []).length === 0 && (
                    <p className="p-4 text-sm text-muted-foreground">Sem alertas pendentes.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
