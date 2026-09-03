import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AcessoPortal = {
  id: string;
  nome: string;
  cpf: string | null;
  url: string | null;
  tipo: string;
  vencimento: string | null;
  login: string | null;
  senha: string | null;
};

export type AcessoForm = Omit<AcessoPortal, "id">;

/** Cadastro de logins/senhas dos portais da equipe (como o "Acessos" do ConLicitação). */
export function usePortaisAcessos() {
  const { equipeId } = useAuth();
  const qc = useQueryClient();

  const { data: acessos, isLoading } = useQuery({
    queryKey: ["portais-acessos", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portais_acessos")
        .select("id,nome,cpf,url,tipo,vencimento,login,senha")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as AcessoPortal[];
    },
  });

  const invalidar = () => void qc.invalidateQueries({ queryKey: ["portais-acessos"] });

  const criar = useMutation({
    mutationFn: async (valores: AcessoForm) => {
      if (!equipeId) throw new Error("sem equipe");
      const { error } = await supabase
        .from("portais_acessos")
        .insert({ ...valores, equipe_id: equipeId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Acesso salvo.");
    },
    onError: () => toast.error("Não foi possível salvar o acesso."),
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, ...valores }: AcessoForm & { id: string }) => {
      const { error } = await supabase.from("portais_acessos").update(valores).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Acesso atualizado.");
    },
    onError: () => toast.error("Não foi possível atualizar o acesso."),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portais_acessos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Acesso removido.");
    },
    onError: () => toast.error("Não foi possível remover o acesso."),
  });

  return { acessos: acessos ?? [], isLoading, criar, atualizar, excluir };
}
