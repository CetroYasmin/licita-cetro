import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PALAVRAS_SUGERIDAS } from "@/services/monitoring/keywords";

export const Route = createFileRoute("/monitoramento/palavras")({
  head: () => ({
    meta: [
      { title: "Palavras-chave de alerta - Licitações Cetro" },
      {
        name: "description",
        content:
          "Cadastre palavras-chave como convocação, documentação, habilitação e recurso para receber alertas quando aparecerem no chat do pregão.",
      },
      { property: "og:title", content: "Palavras-chave de alerta - Licitações Cetro" },
      {
        property: "og:description",
        content: "Alertas automáticos quando o chat do pregão citar termos importantes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Palavras,
});

function Palavras() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [nova, setNova] = useState("");

  const { data } = useQuery({
    queryKey: ["monitor", "palavras", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase
        .from("palavras_chave")
        .select("*")
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const adicionar = useMutation({
    mutationFn: async (palavras: string[]) => {
      if (!user) throw new Error("sem sessão");
      const limpas = palavras.map((p) => p.trim()).filter((p) => p.length >= 2);
      if (limpas.length === 0) throw new Error("Informe uma palavra com pelo menos 2 letras");
      const { error } = await supabase
        .from("palavras_chave")
        .upsert(
          limpas.map((palavra) => ({ user_id: user.id, palavra, ativo: true })),
          { onConflict: "user_id,palavra" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      setNova("");
      void qc.invalidateQueries({ queryKey: ["monitor", "palavras"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternar = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("palavras_chave").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["monitor", "palavras"] }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("palavras_chave").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["monitor", "palavras"] }),
  });

  const palavras = data ?? [];
  const faltando = PALAVRAS_SUGERIDAS.filter(
    (s) => !palavras.some((p) => p.palavra.toLowerCase() === s.toLowerCase()),
  );

  return (
    <AppLayout
      titulo="Palavras-chave"
      descricao="Termos que geram alerta quando aparecem no chat de um pregão monitorado"
      acoes={
        <Button variant="outline" size="sm" asChild>
          <Link to="/monitoramento">Painel</Link>
        </Button>
      }
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <form
          className="surface-panel flex flex-wrap gap-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            adicionar.mutate([nova]);
          }}
        >
          <Input
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            placeholder="Ex.: documentação"
            maxLength={60}
            className="min-w-[200px] flex-1"
          />
          <Button type="submit" disabled={adicionar.isPending}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        </form>

        {faltando.length > 0 && (
          <div className="surface-panel p-4">
            <p className="text-xs text-muted-foreground">Sugestões</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {faltando.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => adicionar.mutate([s])}>
                  + {s}
                </Button>
              ))}
              <Button size="sm" onClick={() => adicionar.mutate(faltando)}>
                Adicionar todas
              </Button>
            </div>
          </div>
        )}

        <div className="surface-panel divide-y">
          {palavras.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-4">
              <span className="flex-1 text-sm font-medium">{p.palavra}</span>
              <Badge variant={p.ativo ? "default" : "outline"}>{p.ativo ? "ativa" : "inativa"}</Badge>
              <Switch
                checked={p.ativo}
                onCheckedChange={(v) => alternar.mutate({ id: p.id, ativo: v })}
                aria-label="Ativar palavra-chave"
              />
              <Button variant="ghost" size="icon" onClick={() => remover.mutate(p.id)} aria-label="Remover">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {palavras.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma palavra-chave cadastrada.
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
