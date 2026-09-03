import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PORTAIS } from "@/lib/pncp.functions";

export type PortalConfig = { nome: string; ativo: boolean; observacoes: string | null };

/**
 * Gerenciamento dos portais de origem (como o "Gerenciar portais" do ConLicitação):
 * a equipe liga/desliga cada sistema em que costuma disputar e a pesquisa/boletim
 * passa a destacar (ou esconder) os editais operados nele.
 */
export function usePortais() {
  const { equipeId } = useAuth();
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["portais-config", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portais_config")
        .select("nome,ativo,observacoes");
      if (error) throw error;
      return (data ?? []) as PortalConfig[];
    },
  });

  const mapa = new Map((config ?? []).map((p) => [p.nome, p]));
  /** Sem registro = ativo (padrão: nada é escondido sem escolha da equipe). */
  const portalAtivo = (nome: string) => mapa.get(nome)?.ativo ?? true;
  const observacoesDe = (nome: string) => mapa.get(nome)?.observacoes ?? "";

  const salvar = useMutation({
    mutationFn: async (valores: { nome: string; ativo?: boolean; observacoes?: string | null }) => {
      if (!equipeId) throw new Error("sem equipe");
      const atual = mapa.get(valores.nome);
      const { error } = await supabase.from("portais_config").upsert(
        {
          equipe_id: equipeId,
          nome: valores.nome,
          ativo: valores.ativo ?? atual?.ativo ?? true,
          observacoes:
            valores.observacoes !== undefined ? valores.observacoes : (atual?.observacoes ?? null),
        },
        { onConflict: "equipe_id,nome" },
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["portais-config"] }),
    onError: () => toast.error("Não foi possível salvar a configuração do portal."),
  });

  const desativados = PORTAIS.filter((p) => !portalAtivo(p));

  return {
    portais: PORTAIS,
    isLoading,
    portalAtivo,
    observacoesDe,
    salvar,
    desativados,
    temFiltro: desativados.length > 0,
  };
}
