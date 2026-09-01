import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Radio, Copy, KeyRound, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dataHora } from "@/lib/formato";

export const Route = createFileRoute("/chats")({
  head: () => ({
    meta: [
      { title: "Monitoramento de chats - Licitações Cetro" },
      {
        name: "description",
        content:
          "Acompanhe ao vivo as mensagens dos chats das sessões de disputa de todas as licitações da equipe.",
      },
      { property: "og:title", content: "Monitoramento de chats - Licitações Cetro" },
      {
        property: "og:description",
        content: "Mensagens ao vivo dos chats das sessões de licitação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Chats,
});

const PAPEL_COR: Record<string, string> = {
  pregoeiro: "bg-primary/10 text-primary",
  sistema: "bg-muted text-muted-foreground",
  equipe: "bg-secondary/15 text-secondary",
  licitante: "bg-accent text-accent-foreground",
};

function Chats() {
  const { equipeId, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [ultimaAoVivo, setUltimaAoVivo] = useState<number | null>(null);
  const [mostrarChaves, setMostrarChaves] = useState(false);

  const { data } = useQuery({
    queryKey: ["chats-monitor"],
    enabled: Boolean(equipeId),
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_mensagens")
        .select("*,licitacoes(id,numero,orgao,portal,status,site_url)")
        .order("enviada_em", { ascending: false })
        .limit(300);
      return data ?? [];
    },
  });

  const { data: chaves } = useQuery({
    queryKey: ["captura-tokens", equipeId],
    enabled: Boolean(equipeId) && mostrarChaves,
    queryFn: async () => {
      const { data } = await supabase
        .from("captura_tokens")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Recebe ao vivo cada mensagem enviada pela extensão de captura da equipe.
  useEffect(() => {
    if (!equipeId) return;
    const canal = supabase
      .channel("chat-ao-vivo")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_mensagens" },
        () => {
          setUltimaAoVivo(Date.now());
          void queryClient.invalidateQueries({ queryKey: ["chats-monitor"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [equipeId, queryClient]);

  const aoVivo = ultimaAoVivo != null && Date.now() - ultimaAoVivo < 5 * 60 * 1000;

  const mensagens = (data ?? []) as any[];
  const grupos = new Map<string, any[]>();
  for (const m of mensagens) {
    const chave = m.licitacao_id;
    grupos.set(chave, [...(grupos.get(chave) ?? []), m]);
  }

  const endpoint =
    typeof window === "undefined" ? "" : `${window.location.origin}/api/public/chat-ingest`;

  const copiar = async (texto: string, rotulo: string) => {
    await navigator.clipboard.writeText(texto);
    toast.success(`${rotulo} copiado`);
  };

  const criarChave = async () => {
    if (!equipeId) return;
    const { error } = await supabase
      .from("captura_tokens")
      .insert({ equipe_id: equipeId, nome: "Captura de chat" });
    if (error) toast.error(error.message);
    else {
      toast.success("Chave de captura criada");
      void queryClient.invalidateQueries({ queryKey: ["captura-tokens", equipeId] });
    }
  };

  return (
    <AppLayout
      titulo="Monitoramento de chats"
      descricao="Mensagens das sessões de disputa espelhadas do portal em tempo real"
      acoes={
        <>
          <Badge variant={aoVivo ? "default" : "outline"} className="gap-1">
            <Radio className={aoVivo ? "h-3 w-3 animate-pulse" : "h-3 w-3"} />
            {aoVivo ? "Sessão ao vivo" : "Sem sessão ativa"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setMostrarChaves((v) => !v)}>
            <KeyRound className="mr-2 h-4 w-4" /> Captura
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mostrarChaves && (
          <div className="surface-panel space-y-4 p-4">
            <div>
              <p className="font-display text-sm font-semibold">Captura ao vivo do chat do portal</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A extensão/bookmarklet da equipe roda na página da sessão já aberta e logada no
                portal (ex.: Compras.gov.br). Ela lê as respostas de consulta periódica (JSON) ou o
                canal WebSocket do próprio portal e envia cada mensagem para o endereço abaixo, com
                a chave da equipe. Nenhuma senha é armazenada aqui.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-xs">{endpoint}</code>
              <Button variant="ghost" size="sm" onClick={() => void copiar(endpoint, "Endereço")}>
                <Copy className="mr-2 h-3 w-3" /> Copiar
              </Button>
            </div>

            <pre className="overflow-x-auto rounded bg-muted p-3 text-[11px] leading-relaxed">
{`POST ${endpoint || "/api/public/chat-ingest"}
x-captura-token: <chave da equipe>

{
  "referencia": "90012/2026",        // nº do pregão, id da compra ou URL da sessão
  "portal": "Compras.gov.br",
  "mensagens": [
    { "externo_id": "1821", "autor": "Pregoeiro", "papel": "pregoeiro",
      "mensagem": "Sessão reaberta.", "enviada_em": "2026-09-01T14:02:00-03:00" }
  ]
}`}
            </pre>

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {isAdmin
                  ? "Crie uma chave por operador para poder revogar individualmente."
                  : "Só administradores da equipe podem criar chaves de captura."}
              </p>
              {isAdmin && (
                <Button size="sm" onClick={() => void criarChave()}>
                  <Plus className="mr-2 h-4 w-4" /> Nova chave
                </Button>
              )}
            </div>

            <ul className="divide-y rounded border">
              {(chaves ?? []).map((c: any) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 p-3 text-xs">
                  <span className="font-medium">{c.nome}</span>
                  <code className="rounded bg-muted px-2 py-0.5">{c.token}</code>
                  <Button variant="ghost" size="sm" onClick={() => void copiar(c.token, "Token")}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Badge variant={c.ativo ? "outline" : "secondary"}>
                    {c.ativo ? "ativa" : "desativada"}
                  </Badge>
                  <span className="text-muted-foreground">
                    {c.ultimo_uso_em ? `último uso ${dataHora(c.ultimo_uso_em)}` : "nunca usada"}
                  </span>
                </li>
              ))}
              {(chaves ?? []).length === 0 && (
                <li className="p-3 text-xs text-muted-foreground">Nenhuma chave criada ainda.</li>
              )}
            </ul>
          </div>
        )}

        {[...grupos.entries()].map(([id, msgs]) => {
          const lic = msgs[0].licitacoes;
          return (
            <div key={id} className="surface-panel">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                <div>
                  <p className="font-display text-sm font-semibold">{lic?.numero}</p>
                  <p className="text-xs text-muted-foreground">
                    {lic?.orgao} · {lic?.portal ?? "portal"} ·{" "}
                    <Badge variant="outline">{lic?.status}</Badge>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {lic?.site_url && (
                    <Button size="sm" asChild>
                      <a href={lic.site_url} target="_blank" rel="noreferrer">
                        Abrir sessão no portal
                      </a>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/licitacoes/$id" params={{ id }}>
                      Abrir chat completo
                    </Link>
                  </Button>
                </div>
              </div>
              <ul className="divide-y">
                {msgs.slice(0, 8).map((m) => (
                  <li key={m.id} className="p-3 text-sm">
                    <span className="font-medium">{m.autor}</span>{" "}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${PAPEL_COR[m.papel] ?? PAPEL_COR["licitante"]}`}
                    >
                      {m.papel ?? m.origem}
                    </span>{" "}
                    <span className="text-xs text-muted-foreground">{dataHora(m.enviada_em)}</span>
                    <p className="mt-1">{m.mensagem}</p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {grupos.size === 0 && (
          <div className="surface-panel p-10 text-center text-sm text-muted-foreground">
            Nenhuma mensagem recebida ainda. Configure a captura ao vivo no botão “Captura” ou cole o
            chat da sessão na aba “Chat da licitação”.
          </div>
        )}
      </div>
    </AppLayout>
  );
}
