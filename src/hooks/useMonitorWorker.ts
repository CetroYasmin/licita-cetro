import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sincronizarMonitoramento } from "@/services/monitoring/monitoring.functions";

/**
 * Dispara o worker de monitoramento periodicamente enquanto a tela está aberta.
 * O worker roda no servidor: connector → normalizer → banco → notificações.
 */
export function useMonitorWorker(opcoes?: { pregaoId?: string; intervalo?: number; ativo?: boolean }) {
  const sincronizar = useServerFn(sincronizarMonitoramento);
  const { pregaoId, intervalo = 6000, ativo = true } = opcoes ?? {};

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;

    const rodar = async () => {
      try {
        await sincronizar({ data: pregaoId ? { pregao_id: pregaoId } : {} });
      } catch (erro) {
        console.error("Falha no ciclo de monitoramento", erro);
      }
    };

    void rodar();
    const timer = setInterval(() => {
      if (!cancelado) void rodar();
    }, intervalo);

    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, [sincronizar, pregaoId, intervalo, ativo]);
}
