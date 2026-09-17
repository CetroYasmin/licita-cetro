import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { contagemRegressiva, dataHora } from "@/lib/formato";

export const Route = createFileRoute("/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda e calendário - Licitações Cetro" },
      {
        name: "description",
        content:
          "Calendário de sessões, prazos de recurso, entrega de documentos e tarefas da equipe em um só lugar.",
      },
      { property: "og:title", content: "Agenda e calendário - Licitações Cetro" },
      {
        property: "og:description",
        content: "Sessões, prazos e tarefas das licitações em calendário mensal.",
      },
    ],
  }),
  component: Agenda,
});

type Evento = {
  id: string;
  quando: string;
  titulo: string;
  detalhe: string;
  tipo: "sessão" | "prazo" | "tarefa";
  licitacaoId: string | null;
};

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function Agenda() {
  const { equipeId } = useAuth();
  const [ref, setRef] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["agenda"],
    enabled: Boolean(equipeId),
    queryFn: async () => {
      const [lics, prazos, tarefas] = await Promise.all([
        supabase
          .from("licitacoes")
          .select(
            "id,numero,orgao,data_sessao,proximo_evento_data,plataforma,portal,status,aprovacao_status",
          ),
        supabase.from("prazos").select("*,licitacoes(numero)"),
        supabase.from("tarefas").select("*,licitacoes(numero)"),
      ]);
      // Somente licitações acompanhadas, já aprovadas pela diretoria e ainda em disputa.
      const encerradas = [
        "encerrada",
        "perdida",
        "vencida",
        "homologada",
        "deserta",
        "fracassada",
      ];
      const participando = (lics.data ?? []).filter(
        (l: any) => l.aprovacao_status === "aprovada" && !encerradas.includes(l.status),
      );
      const aptas = new Set(participando.map((l: any) => l.id));
      const eventos: Evento[] = [];
      for (const l of participando as any[]) {
        const quando = l.proximo_evento_data ?? l.data_sessao;
        if (quando)
          eventos.push({
            id: `s-${l.id}`,
            quando,
            titulo: `Sessão · ${l.numero}`,
            detalhe: `${l.orgao ?? ""} — ${l.portal ?? l.plataforma ?? "portal"}`,
            tipo: "sessão",
            licitacaoId: l.id,
          });
      }
      for (const p of (prazos.data ?? []) as any[]) {
        if (!p.concluido && aptas.has(p.licitacao_id))
          eventos.push({
            id: `p-${p.id}`,
            quando: p.data_limite,
            titulo: `${p.tipo} · ${p.licitacoes?.numero ?? ""}`,
            detalhe: p.descricao ?? "",
            tipo: "prazo",
            licitacaoId: p.licitacao_id,
          });
      }
      for (const t of (tarefas.data ?? []) as any[]) {
        if (t.prazo && !t.concluida)
          eventos.push({
            id: `t-${t.id}`,
            quando: t.prazo,
            titulo: `Tarefa · ${t.titulo}`,
            detalhe: t.licitacoes?.numero ?? "",
            tipo: "tarefa",
            licitacaoId: t.licitacao_id,
          });
      }
      return eventos.sort((a, b) => a.quando.localeCompare(b.quando));
    },
  });

  const eventos = data ?? [];
  const porDia = useMemo(() => {
    const mapa = new Map<string, Evento[]>();
    for (const e of eventos) {
      const chave = new Date(e.quando).toISOString().slice(0, 10);
      mapa.set(chave, [...(mapa.get(chave) ?? []), e]);
    }
    return mapa;
  }, [eventos]);

  const celulas = useMemo(() => {
    const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const totalDias = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
    const vazias = inicio.getDay();
    return [
      ...Array.from({ length: vazias }, () => null),
      ...Array.from(
        { length: totalDias },
        (_, i) => new Date(ref.getFullYear(), ref.getMonth(), i + 1),
      ),
    ];
  }, [ref]);

  const hoje = new Date().toISOString().slice(0, 10);
  const doDia = selecionado ? porDia.get(selecionado) ?? [] : [];
  const proximos = eventos.filter((e) => new Date(e.quando) >= new Date()).slice(0, 12);

  return (
    <AppLayout titulo="Agenda" descricao="Sessões, prazos e tarefas em calendário">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="surface-panel p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold capitalize">
              {ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date();
                  setRef(new Date(d.getFullYear(), d.getMonth(), 1));
                }}
              >
                Hoje
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
            {DIAS.map((d) => (
              <div key={d} className="pb-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celulas.map((dia, i) => {
              if (!dia) return <div key={`v${i}`} className="min-h-24 rounded-md bg-muted/30" />;
              const chave = new Date(dia.getTime() - dia.getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 10);
              const lista = porDia.get(chave) ?? [];
              return (
                <button
                  key={chave}
                  onClick={() => setSelecionado(chave)}
                  className={`min-h-24 rounded-md border p-1.5 text-left transition-colors hover:bg-accent ${
                    chave === hoje ? "border-primary bg-primary/5" : ""
                  } ${selecionado === chave ? "ring-2 ring-secondary" : ""}`}
                >
                  <span className="text-xs font-semibold">{dia.getDate()}</span>
                  <div className="mt-1 space-y-1">
                    {lista.slice(0, 3).map((e) => (
                      <p
                        key={e.id}
                        className={`truncate rounded px-1 py-0.5 text-[10px] ${
                          e.tipo === "sessão"
                            ? "bg-secondary/15 text-secondary"
                            : e.tipo === "prazo"
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {e.titulo}
                      </p>
                    ))}
                    {lista.length > 3 && (
                      <p className="text-[10px] text-muted-foreground">+{lista.length - 3} mais</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          {selecionado && (
            <div className="surface-panel p-4">
              <h3 className="text-sm font-semibold">
                Compromissos de {new Date(`${selecionado}T12:00:00`).toLocaleDateString("pt-BR")}
              </h3>
              <ul className="mt-3 space-y-3">
                {doDia.map((e) => (
                  <li key={e.id} className="text-sm">
                    <Badge variant="outline">{e.tipo}</Badge>
                    <p className="mt-1 font-medium">{e.titulo}</p>
                    <p className="text-xs text-muted-foreground">{e.detalhe}</p>
                    <p className="text-xs text-muted-foreground">{dataHora(e.quando)}</p>
                    {e.licitacaoId && (
                      <Link
                        to="/licitacoes/$id"
                        params={{ id: e.licitacaoId }}
                        className="text-xs text-secondary hover:underline"
                      >
                        Abrir licitação
                      </Link>
                    )}
                  </li>
                ))}
                {doDia.length === 0 && (
                  <li className="text-sm text-muted-foreground">Nenhum compromisso nesse dia.</li>
                )}
              </ul>
            </div>
          )}

          <div className="surface-panel p-4">
            <h3 className="text-sm font-semibold">Próximos compromissos</h3>
            <ul className="mt-3 space-y-3">
              {proximos.map((e) => (
                <li key={e.id} className="border-b pb-2 text-sm last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{e.titulo}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {contagemRegressiva(e.quando)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{dataHora(e.quando)}</p>
                </li>
              ))}
              {proximos.length === 0 && (
                <li className="text-sm text-muted-foreground">Nenhum compromisso futuro.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
