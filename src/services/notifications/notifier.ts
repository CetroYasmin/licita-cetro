/**
 * Camada de notificações. Hoje só existe o canal "in-app" (banco + tempo real).
 * Push, e-mail, WhatsApp e Telegram entram como novos canais, sem alterar
 * o MonitoringService.
 */

export type NotificacaoEvento = {
  user_id: string;
  pregao_id: string;
  mensagem_id: string | null;
  tipo: "palavra_chave" | "nova_mensagem";
  palavra: string | null;
  titulo: string;
  corpo: string;
};

export interface NotificationChannel {
  readonly nome: string;
  enviar(eventos: NotificacaoEvento[]): Promise<void>;
}

/** Canal in-app: persiste na tabela de notificações (lida via tempo real). */
export function canalInApp(inserir: (eventos: NotificacaoEvento[]) => Promise<void>): NotificationChannel {
  return {
    nome: "in-app",
    enviar: async (eventos) => {
      if (eventos.length === 0) return;
      await inserir(eventos);
    },
  };
}

export async function despachar(canais: NotificationChannel[], eventos: NotificacaoEvento[]) {
  for (const canal of canais) {
    try {
      await canal.enviar(eventos);
    } catch (erro) {
      console.error(`Falha no canal de notificação ${canal.nome}`, erro);
    }
  }
}
