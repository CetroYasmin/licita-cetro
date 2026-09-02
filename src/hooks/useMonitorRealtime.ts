import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Assina o canal de tempo real (WebSocket) das mensagens e notificações.
 * Novas mensagens chegam sem recarregar a página.
 */
export function useMonitorRealtime(onNovaMensagem?: () => void) {
  const qc = useQueryClient();

  useEffect(() => {
    const canal = supabase
      .channel("monitoramento-ao-vivo")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pregao_mensagens" },
        () => {
          void qc.invalidateQueries({ queryKey: ["monitor"] });
          onNovaMensagem?.();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes" },
        () => {
          void qc.invalidateQueries({ queryKey: ["monitor"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [qc, onNovaMensagem]);
}
