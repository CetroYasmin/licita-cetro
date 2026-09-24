import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, ArrowLeft, RefreshCw, Search, Star, ScanSearch, MessagesSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { dataHora } from "@/lib/formato";
import { combina } from "@/lib/busca";
import { portalDisputaDe, ROTULO_STATUS_CHAT, type StatusChat } from "@/lib/portalDisputa";
import { detectarPortais } from "@/services/monitoring/deteccao.functions";
import { sincronizarChat } from "@/services/monitoring/monitoring.functions";

export const Route = createFileRoute("/monitorar-chat")({
  head: () => ({
    meta: [
      { title: "Monitorar Chat - Licitações Cetro" },
      {
        name: "description",
        content: "Acompanhe em um só lugar as mensagens dos chats das sessões das licitações da equipe.",
      },
      { property: "og:title", content: "Monitorar Chat - Licitações Cetro" },
      { property: "og:description", content: "Mensagens dos pregões acompanhados, com não lidas e importantes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MonitorarChat,
});

type Filtro = "todos" | "nao_lidos" | "importantes" | "arquivados";

const CAMPOS =
  "id, numero, orgao, objeto, status, portal, portal_manual, data_sessao, proximo_evento_data, chat_monitorar, chat_status, chat_status_motivo, chat_ultima_coleta, chat_ultimo_erro, chat_ultima_msg_em";

function statusDe(l: any): StatusChat {
  if (l.chat_monitorar) return "monitorando";
  return (l.chat_status as StatusChat) ?? "portal_desconhecido";
}

function MonitorarChat() {
  const { equipeId, user } = useAuth();
  const qc = useQueryClient();
  const detectar = useServerFn(detectarPortais);
  const sincronizar = useServerFn(sincronizarChat);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [sel, setSel] = useState<string | null>(null);
  const [buscaMsg, setBuscaMsg] = useState("");
  const detectou = useRef(false);

  const licitacoes = useQuery({
    queryKey: ["mc-licitacoes", equipeId],
    enabled: !!equipeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacoes")
        .select(CAMPOS)
        .neq("status", "declinada")
        .order("updated_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const leituras = useQuery({
    queryKey: ["mc-leituras", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("chat_leituras").select("*")).data ?? [],
  });

  const recentes = useQuery({
    queryKey: ["mc-recentes", equipeId],
    enabled: !!equipeId,
    queryFn: async () => {
      const desde = new Date(Date.now() - 60 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("chat_mensagens")
        .select("licitacao_id, created_at, enviada_em")
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const mensagens = useQuery({
    queryKey: ["mc-mensagens", sel],
    enabled: !!sel,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_mensagens")
        .select("id, autor, papel, origem, mensagem, enviada_em, created_at")
        .eq("licitacao_id", sel!)
        .order("enviada_em", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Retrodetecção segura das licitações já acompanhadas (não sobrescreve escolhas manuais).
  const rodarDeteccao = useMutation({
    mutationFn: () => detectar({ data: {} }),
    onSuccess: (r) => {
      if (r.atualizadas > 0) void qc.invalidateQueries({ queryKey: ["mc-licitacoes"] });
    },
  });
  useEffect(() => {
    if (equipeId && !detectou.current) {
      detectou.current = true;
      rodarDeteccao.mutate();
    }
  }, [equipeId]);

  // Tempo real: mensagens novas da equipe.
  useEffect(() => {
    if (!equipeId) return;
    const canal = supabase
      .channel(`monitorar-chat-${equipeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_mensagens", filter: `equipe_id=eq.${equipeId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["mc-recentes"] });
          void qc.invalidateQueries({ queryKey: ["mc-mensagens"] });
        },
      )
      .subscribe();
    return () => void supabase.removeChannel(canal);
  }, [equipeId, qc]);

  const leituraDe = (id: string) => (leituras.data ?? []).find((r: any) => r.licitacao_id === id);

  const naoLidas = useMemo(() => {
    const m = new Map<string, number>();
    const ultima = new Map<string, string>();
    for (const r of recentes.data ?? []) {
      if (!ultima.has(r.licitacao_id)) ultima.set(r.licitacao_id, r.enviada_em);
      const lida = leituraDe(r.licitacao_id)?.lida_ate;
      if (!lida || r.created_at > lida) m.set(r.licitacao_id, (m.get(r.licitacao_id) ?? 0) + 1);
    }
    return { m, ultima };
  }, [recentes.data, leituras.data]);

  const salvarLeitura = useMutation({
    mutationFn: async (v: { licitacao_id: string; lida_ate?: string; importante?: boolean; arquivada?: boolean }) => {
      const atual = leituraDe(v.licitacao_id);
      const { error } = await supabase.from("chat_leituras").upsert(
        {
          user_id: user!.id,
          equipe_id: equipeId!,
          licitacao_id: v.licitacao_id,
          lida_ate: v.lida_ate ?? atual?.lida_ate ?? null,
          importante: v.importante ?? atual?.importante ?? false,
          arquivada: v.arquivada ?? atual?.arquivada ?? false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,licitacao_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mc-leituras"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (sel && user && (naoLidas.m.get(sel) ?? 0) > 0) {
      salvarLeitura.mutate({ licitacao_id: sel, lida_ate: new Date().toISOString() });
    }
  }, [sel, naoLidas.m.get(sel ?? "")]);

  const sync = useMutation({
    mutationFn: (id: string) => sincronizar({ data: { licitacao_id: id } }),
    onSuccess: (r) => {
      toast.success(`${r.mensagens_novas} mensagem(ns) nova(s).`);
      void qc.invalidateQueries({ queryKey: ["mc-licitacoes"] });
      void qc.invalidateQueries({ queryKey: ["mc-mensagens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lista = useMemo(() => {
    return (licitacoes.data ?? [])
      .filter((l: any) => {
        const r = leituraDe(l.id);
        if (filtro === "arquivados") return !!r?.arquivada;
        if (r?.arquivada) return false;
        if (filtro === "nao_lidos") return (naoLidas.m.get(l.id) ?? 0) > 0;
        if (filtro === "importantes") return !!r?.importante;
        return true;
      })
      .filter((l: any) => combina(`${l.numero} ${l.orgao ?? ""} ${l.objeto ?? ""} ${l.portal ?? ""}`, busca))
      .sort((a: any, b: any) => {
        const ta = naoLidas.ultima.get(a.id) ?? a.chat_ultima_msg_em ?? "";
        const tb = naoLidas.ultima.get(b.id) ?? b.chat_ultima_msg_em ?? "";
        if (ta !== tb) return tb > ta ? 1 : -1;
        return Number(b.chat_monitorar) - Number(a.chat_monitorar);
      });
  }, [licitacoes.data, leituras.data, naoLidas, filtro, busca]);

  const atual = (licitacoes.data ?? []).find((l: any) => l.id === sel);
  const msgs = (mensagens.data ?? []).filter((m) => combina(`${m.autor} ${m.mensagem}`, buscaMsg));

  const FILTROS: Array<[Filtro, string]> = [
    ["todos", "Todos"],
    ["nao_lidos", "Não lidos"],
    ["importantes", "Importantes"],
    ["arquivados", "Arquivados"],
  ];

  return (
    <AppLayout titulo="Monitorar Chat" descricao="Mensagens dos chats das sessões acompanhadas pela equipe">
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <aside className={cn("surface-panel flex min-h-[60vh] flex-col p-3", sel && "hidden lg:flex")}>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar pregão, órgão ou portal" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {FILTROS.map(([v, r]) => (
              <Button key={v} size="sm" variant={filtro === v ? "default" : "outline"} onClick={() => setFiltro(v)}>
                {r}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{lista.length} licitação(ões)</span>
            <Button size="sm" variant="ghost" disabled={rodarDeteccao.isPending} onClick={() => rodarDeteccao.mutate()}>
              <ScanSearch className="mr-1 h-3.5 w-3.5" />
              {rodarDeteccao.isPending ? "Identificando…" : "Identificar portais"}
            </Button>
          </div>
          <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
            {licitacoes.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
            {licitacoes.error && <p className="p-4 text-sm text-destructive">Não foi possível carregar as licitações.</p>}
            {!licitacoes.isLoading && lista.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma licitação neste filtro.</p>
            )}
            {lista.map((l: any) => {
              const n = naoLidas.m.get(l.id) ?? 0;
              const r = leituraDe(l.id);
              const st = statusDe(l);
              return (
                <button
                  key={l.id}
                  onClick={() => setSel(l.id)}
                  className={cn(
                    "w-full rounded-md border p-2.5 text-left transition-colors hover:bg-muted",
                    sel === l.id ? "border-primary bg-primary/5" : "border-transparent",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", n > 0 ? "font-bold" : "font-medium")}>{l.numero}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {r?.importante && <Star className="h-3.5 w-3.5 fill-current text-primary" />}
                      {n > 0 && <Badge className="h-5 px-1.5 text-[10px]">{n}</Badge>}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{l.orgao}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-secondary">Portal: {portalDisputaDe(l) ?? "a identificar"}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {naoLidas.ultima.get(l.id) ? dataHora(naoLidas.ultima.get(l.id)!) : dataHora(l.proximo_evento_data ?? l.data_sessao)}
                    </span>
                  </div>
                  <span className={cn("mt-1 inline-block text-[10px]", st === "monitorando" ? "text-emerald-700" : "text-muted-foreground")}>
                    ● {ROTULO_STATUS_CHAT[st]}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={cn("surface-panel flex min-h-[60vh] flex-col", !sel && "hidden lg:flex")}>
          {!atual ? (
            <div className="m-auto p-8 text-center text-sm text-muted-foreground">
              <MessagesSquare className="mx-auto mb-2 h-8 w-8" />
              Selecione uma licitação para ver o histórico do chat.
            </div>
          ) : (
            <>
              <header className="border-b p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Button size="sm" variant="ghost" className="-ml-2 mb-1 lg:hidden" onClick={() => setSel(null)}>
                      <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
                    </Button>
                    <Link to="/licitacoes/$id" params={{ id: atual.id }} className="font-display font-semibold hover:underline">
                      {atual.numero}
                    </Link>
                    <p className="text-xs text-muted-foreground">{atual.orgao}</p>
                    <p className="mt-1 line-clamp-2 text-xs">{atual.objeto}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label="Marcar como importante"
                      onClick={() => salvarLeitura.mutate({ licitacao_id: atual.id, importante: !leituraDe(atual.id)?.importante })}
                    >
                      <Star className={cn("h-4 w-4", leituraDe(atual.id)?.importante && "fill-current text-primary")} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => salvarLeitura.mutate({ licitacao_id: atual.id, arquivada: !leituraDe(atual.id)?.arquivada })}
                    >
                      <Archive className="mr-1 h-4 w-4" />
                      {leituraDe(atual.id)?.arquivada ? "Desarquivar" : "Arquivar"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={!atual.chat_monitorar || sync.isPending}
                      onClick={() => sync.mutate(atual.id)}
                      title={atual.chat_monitorar ? "Consultar o portal agora" : "Coleta automática não disponível para esta licitação"}
                    >
                      <RefreshCw className={cn("mr-1 h-4 w-4", sync.isPending && "animate-spin")} /> Atualizar
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">Portal: {portalDisputaDe(atual) ?? "a identificar"}</Badge>
                  <Badge variant={statusDe(atual) === "monitorando" ? "default" : "secondary"}>
                    {ROTULO_STATUS_CHAT[statusDe(atual)]}
                  </Badge>
                  {atual.chat_ultima_coleta && <span className="text-muted-foreground">Última coleta: {dataHora(atual.chat_ultima_coleta)}</span>}
                </div>
                {!atual.chat_monitorar && atual.chat_status_motivo && (
                  <p className="mt-2 text-xs text-muted-foreground">{atual.chat_status_motivo}</p>
                )}
                {atual.chat_ultimo_erro && <p className="mt-2 text-xs text-destructive">Último erro: {atual.chat_ultimo_erro}</p>}
                <Input className="mt-3 h-8" placeholder="Buscar nas mensagens" value={buscaMsg} onChange={(e) => setBuscaMsg(e.target.value)} />
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto p-4" style={{ maxHeight: "65vh" }}>
                {mensagens.isLoading && <p className="text-sm text-muted-foreground">Carregando mensagens…</p>}
                {mensagens.error && <p className="text-sm text-destructive">Não foi possível carregar as mensagens.</p>}
                {!mensagens.isLoading && msgs.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma mensagem registrada. {atual.chat_monitorar ? "Assim que o portal publicar, elas aparecem aqui." : "Você pode colar o chat na aba Chat da licitação."}
                  </p>
                )}
                {msgs.map((m) => (
                  <div key={m.id} className={cn("rounded-md border p-2.5 text-sm", m.papel === "pregoeiro" && "border-primary/30 bg-primary/5")}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold">{m.autor}</span>
                      <span className="text-muted-foreground">{dataHora(m.enviada_em)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{m.mensagem}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
