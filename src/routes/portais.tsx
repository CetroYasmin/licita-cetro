import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Globe, Power } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePortais } from "@/hooks/usePortais";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/portais")({
  head: () => ({
    meta: [
      { title: "Gerenciar portais de licitação - Licitações Cetro" },
      {
        name: "description",
        content:
          "Escolha em quais portais de licitação a equipe disputa, ligue ou desligue cada sistema e registre login e observações para a pesquisa e os boletins.",
      },
      { property: "og:title", content: "Gerenciar portais - Licitações Cetro" },
      {
        property: "og:description",
        content: "Controle os portais de origem usados na pesquisa e nos boletins da equipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Portais,
});

function Portais() {
  const { equipeId } = useAuth();
  const { portais, portalAtivo, observacoesDe, salvar, desativados } = usePortais();

  /** Quantas licitações em acompanhamento vieram de cada portal. */
  const { data: acompanhadas } = useQuery({
    queryKey: ["portais-acompanhadas", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () =>
      (await supabase.from("licitacoes").select("portal,status").limit(5000)).data ?? [],
  });

  const contar = (nome: string) => (acompanhadas ?? []).filter((l) => l.portal === nome).length;

  return (
    <AppLayout
      titulo="Gerenciar portais"
      descricao="Sistemas de origem em que a equipe disputa — controlam o que aparece na pesquisa e nos boletins"
    >
      <div className="space-y-5">
        <div className="surface-panel p-4 text-sm text-muted-foreground">
          Todo edital é publicado no Portal Nacional (PNCP), mas a disputa acontece no sistema de
          origem (Compras.gov.br, Licitações-e, BLL, Portal de Compras Públicas…). Desligue aqui os
          portais em que a empresa não opera: eles deixam de aparecer na pesquisa e nos boletins
          quando a opção “somente portais liberados” estiver marcada.
          {desativados.length > 0 && (
            <span className="mt-2 block text-foreground">
              {desativados.length} portal(is) desligado(s): {desativados.join(", ")}.
            </span>
          )}
        </div>

        <div className="space-y-2">
          {portais.map((nome) => {
            const ativo = portalAtivo(nome);
            const total = contar(nome);
            return (
              <div key={nome} className="surface-panel flex flex-wrap items-center gap-4 p-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded bg-muted">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {total > 0
                        ? `${total} licitação(ões) em acompanhamento por este portal`
                        : "Nenhuma licitação acompanhada por este portal ainda"}
                    </p>
                  </div>
                </div>

                <Input
                  className="w-full md:w-72"
                  placeholder="Observações (login usado, cadastro pendente…)"
                  defaultValue={observacoesDe(nome)}
                  onBlur={(e) => {
                    if (e.target.value !== observacoesDe(nome))
                      salvar.mutate({ nome, observacoes: e.target.value || null });
                  }}
                />

                <div className="flex items-center gap-3">
                  <Badge variant={ativo ? "secondary" : "outline"}>
                    {ativo ? "Ativo" : "Desligado"}
                  </Badge>
                  <Switch
                    checked={ativo}
                    onCheckedChange={(v) => salvar.mutate({ nome, ativo: v })}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => portais.forEach((nome) => salvar.mutate({ nome, ativo: true }))}
          >
            <Power className="mr-2 h-4 w-4" />
            Ligar todos os portais
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
