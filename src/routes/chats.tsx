import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
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
  const { equipeId } = useAuth();
  const queryClient = useQueryClient();
  const [ultimaAoVivo, setUltimaAoVivo] = useState<number | null>(null);

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

  // Atualiza a lista assim que uma nova mensagem é registrada por alguém da equipe.
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

  return (
    <AppLayout
      titulo="Monitoramento de chats"
      descricao="Mensagens das sessões de disputa registradas nas licitações da equipe"
      acoes={
        <>
          <Badge variant={aoVivo ? "default" : "outline"} className="gap-1">
            <Radio className={aoVivo ? "h-3 w-3 animate-pulse" : "h-3 w-3"} />
            {aoVivo ? "Sessão ao vivo" : "Sem sessão ativa"}
          </Badge>
        </>
      }
    >
      <div className="space-y-4">

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
            Nenhuma mensagem registrada ainda. Cole ou importe o chat da sessão na aba “Chat da
            licitação”.
          </div>
        )}
      </div>
    </AppLayout>
  );
}
