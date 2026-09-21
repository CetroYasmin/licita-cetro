/**
 * Camada de notificações. Canais:
 *  - avisos do app (tabela `alertas`: aparece na tela Alertas e no sino);
 *  - Telegram, opcional: liga sozinho se TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID
 *    existirem nos segredos — é o que avisa quando ninguém está com o app aberto.
 * E-mail e WhatsApp entram como novos canais, sem alterar o MonitoringService.
 */

export type AlertaEvento = {
  equipe_id: string;
  licitacao_id: string | null;
  /** "chat" (palavra-chave) ou "sistema" (falha/encerramento do monitoramento). */
  tipo: "chat" | "sistema";
  titulo: string;
  corpo: string;
};

export interface NotificationChannel {
  readonly nome: string;
  enviar(eventos: AlertaEvento[]): Promise<void>;
}

/** Canal do app: grava em `alertas`. */
export function canalAlertasApp(
  inserir: (eventos: AlertaEvento[]) => Promise<void>,
): NotificationChannel {
  return {
    nome: "app",
    enviar: async (eventos) => {
      if (eventos.length === 0) return;
      await inserir(eventos);
    },
  };
}

const LIMITE_TELEGRAM_POR_RODADA = 8;

/** Devolve null quando o Telegram não está configurado. */
export function canalTelegram(): NotificationChannel | null {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_CHAT_ID"];
  if (!token || !chatId) return null;

  const enviarTexto = async (texto: string) => {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto.slice(0, 4000),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    });
    // Não registramos a URL: ela contém o token do bot.
    if (!r.ok) throw new Error(`Telegram respondeu ${r.status}`);
  };

  return {
    nome: "telegram",
    enviar: async (eventos) => {
      const agora = eventos.slice(0, LIMITE_TELEGRAM_POR_RODADA);
      for (const e of agora) await enviarTexto(`🔔 ${e.titulo}\n${e.corpo}`);
      const resto = eventos.length - agora.length;
      if (resto > 0) await enviarTexto(`… e mais ${resto} aviso(s) no app.`);
    },
  };
}

export async function despachar(canais: NotificationChannel[], eventos: AlertaEvento[]) {
  if (eventos.length === 0) return;
  // Um canal com falha não impede os outros.
  await Promise.all(
    canais.map(async (canal) => {
      try {
        await canal.enviar(eventos);
      } catch (erro) {
        console.error(
          `Falha no canal de notificação ${canal.nome}:`,
          erro instanceof Error ? erro.message : erro,
        );
      }
    }),
  );
}
