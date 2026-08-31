import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
          "Acompanhe em um só lugar as mensagens dos chats das sessões de disputa de todas as licitações da equipe.",
      },
      { property: "og:title", content: "Monitoramento de chats - Licitações Cetro" },
      {
        property: "og:description",
        content: "Mensagens recentes dos chats das sessões de licitação.",
      },
    ],
  }),
  component: Chats,
});

function Chats() {
  const { equipeId } = useAuth();

  const { data } = useQuery({
    queryKey: ["chats-monitor"],
    enabled: Boolean(equipeId),
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_mensagens")
        .select("*,licitacoes(id,numero,orgao,portal,status)")
        .order("enviada_em", { ascending: false })
        .limit(300);
      return data ?? [];
    },
  });

  const mensagens = (data ?? []) as any[];
  const grupos = new Map<string, any[]>();
  for (const m of mensagens) {
    const chave = m.licitacao_id;
    grupos.set(chave, [...(grupos.get(chave) ?? []), m]);
  }

  return (
    <AppLayout
      titulo="Monitoramento de chats"
      descricao="Mensagens das sessões de disputa, atualizadas automaticamente"
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
                <Button variant="outline" size="sm" asChild>
                  <Link to="/licitacoes/$id" params={{ id }}>Abrir chat completo</Link>
                </Button>
              </div>
              <ul className="divide-y">
                {msgs.slice(0, 5).map((m) => (
                  <li key={m.id} className="p-3 text-sm">
                    <span className="font-medium">{m.autor}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      ({m.origem}) · {dataHora(m.enviada_em)}
                    </span>
                    <p className="mt-1">{m.mensagem}</p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {grupos.size === 0 && (
          <div className="surface-panel p-10 text-center text-sm text-muted-foreground">
            Nenhuma mensagem de chat registrada. Registre as mensagens da sessão na aba “Chat da
            licitação”.
          </div>
        )}
      </div>
    </AppLayout>
  );
}
