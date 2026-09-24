import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dataHora } from "@/lib/formato";

export const Route = createFileRoute("/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe e aprovações - Licitações Cetro" },
      {
        name: "description",
        content:
          "Aprove novos usuários manualmente, vincule contas da mesma equipe e gerencie o acesso à base de licitações.",
      },
      { property: "og:title", content: "Equipe e aprovações - Licitações Cetro" },
      {
        property: "og:description",
        content: "Gestão de usuários, aprovação manual e vínculo de contas da mesma equipe.",
      },
    ],
  }),
  component: Equipe,
});

function Equipe() {
  const { equipeId, isAdmin, perfil } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["equipe"],
    enabled: Boolean(equipeId),
    queryFn: async () => {
      const [membros, pendentes, roles] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("profiles").select("*").eq("status", "pendente").order("created_at"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      return {
        membros: membros.data ?? [],
        pendentes: pendentes.data ?? [],
        roles: roles.data ?? [],
      };
    },
  });

  const alterar = useMutation({
    mutationFn: async ({
      id,
      campos,
    }: {
      id: string;
      campos: Record<string, any>;
    }) => {
      const { error } = await supabase.from("profiles").update(campos as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso atualizado.");
      void qc.invalidateQueries({ queryKey: ["equipe"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const papel = useMutation({
    mutationFn: async ({ id, novo }: { id: string; novo: "admin" | "diretor" | "membro" }) => {
      const { error: erroRemover } = await supabase.from("user_roles").delete().eq("user_id", id);
      if (erroRemover) throw erroRemover;
      const { error } = await supabase.from("user_roles").insert({ user_id: id, role: novo });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tipo de acesso atualizado.");
      void qc.invalidateQueries({ queryKey: ["equipe"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roles = (data?.roles ?? []) as any[];
  const ehAdmin = (id: string) => roles.some((r) => r.user_id === id && r.role === "admin");
  const papelDe = (id: string): "admin" | "diretor" | "membro" =>
    ehAdmin(id)
      ? "admin"
      : roles.some((r) => r.user_id === id && r.role === "diretor")
        ? "diretor"
        : "membro";
  const nomePapel = { admin: "Administrador", diretor: "Diretor", membro: "Usuário comum" } as const;

  const membros = (data?.membros ?? []) as any[];
  const pendentes = (data?.pendentes ?? []) as any[];

  return (
    <AppLayout
      titulo="Equipe"
      descricao={`Equipe ${perfil?.empresa_nome ?? ""} · aprovação manual de novos usuários`}
    >
      {!isAdmin && (
        <p className="surface-panel mb-4 p-4 text-sm text-muted-foreground">
          Apenas administradores da equipe podem aprovar novos usuários.
        </p>
      )}

      <div className="surface-panel mb-5">
        <h2 className="border-b p-4 text-sm font-semibold">
          Aguardando aprovação ({pendentes.length})
        </h2>
        <div className="divide-y">
          {pendentes.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">{p.nome ?? p.email}</p>
                <p className="text-xs text-muted-foreground">
                  {p.email} · {p.empresa_nome ?? "empresa não informada"} · solicitado{" "}
                  {dataHora(p.created_at)}
                </p>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      alterar.mutate({
                        id: p.id,
                        campos: { status: "aprovado", equipe_id: equipeId },
                      })
                    }
                  >
                    Aprovar e vincular à equipe
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => alterar.mutate({ id: p.id, campos: { status: "bloqueado" } })}
                  >
                    Recusar
                  </Button>
                </div>
              )}
            </div>
          ))}
          {pendentes.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>
          )}
        </div>
      </div>

      <div className="surface-panel">
        <h2 className="border-b p-4 text-sm font-semibold">Membros da equipe</h2>
        <div className="divide-y">
          {membros.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">{m.nome ?? m.email}</p>
                <p className="text-xs text-muted-foreground">
                  {m.email} · {m.empresa_nome ?? ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{m.status}</Badge>
                <Badge variant="secondary">{nomePapel[papelDe(m.id)]}</Badge>
                {isAdmin && m.status === "aprovado" && m.id !== perfil?.id && (
                  <Select
                    value={papelDe(m.id)}
                    onValueChange={(v) =>
                      papel.mutate({ id: m.id, novo: v as "admin" | "diretor" | "membro" })
                    }
                  >
                    <SelectTrigger className="h-9 w-[190px]">
                      <SelectValue placeholder="Tipo de acesso" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="membro">Usuário comum</SelectItem>
                      <SelectItem value="diretor">Diretor</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {isAdmin && m.status === "aprovado" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => alterar.mutate({ id: m.id, campos: { status: "bloqueado" } })}
                  >
                    Bloquear
                  </Button>
                )}
                {isAdmin && m.status === "bloqueado" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => alterar.mutate({ id: m.id, campos: { status: "aprovado" } })}
                  >
                    Reativar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
