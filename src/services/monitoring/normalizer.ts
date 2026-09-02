import type { ChatMessage } from "@/types/monitoramento";

/** Hash estável (djb2) usado como identificador de fallback. */
function hash(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(36)}`;
}

const TIPOS = new Set(["pregoeiro", "sistema", "licitante", "equipe"]);

/**
 * Garante identificador confiável e campos consistentes antes da persistência.
 * Quando o portal não fornece external_message_id, usa
 * hash(auction_id + author + message + timestamp).
 */
export type MensagemNormalizada = Omit<ChatMessage, "external_message_id"> & {
  external_message_id: string;
};

export function normalizarMensagem(auctionId: string, bruta: ChatMessage): MensagemNormalizada {
  const timestamp = paraIso(bruta.message_timestamp);
  const autor = (bruta.author ?? "").trim() || "Desconhecido";
  const mensagem = (bruta.message ?? "").trim();
  const tipo = TIPOS.has(bruta.author_type) ? bruta.author_type : "licitante";
  const id =
    bruta.external_message_id?.toString().trim() ||
    hash(`${auctionId}|${autor}|${mensagem}|${timestamp}`);

  return {
    external_message_id: id,
    author: autor,
    author_type: tipo,
    message: mensagem,
    message_timestamp: timestamp,
  };
}

export function normalizarLote(auctionId: string, brutas: ChatMessage[]) {
  const vistos = new Set<string>();
  const saida: MensagemNormalizada[] = [];
  for (const bruta of brutas) {
    if (!bruta?.message?.trim()) continue;
    const norm = normalizarMensagem(auctionId, bruta);
    if (vistos.has(norm.external_message_id)) continue;
    vistos.add(norm.external_message_id);
    saida.push(norm);
  }
  return saida.sort(
    (a, b) => new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime(),
  );
}

function paraIso(valor?: string | null): string {
  if (!valor) return new Date().toISOString();
  const direto = new Date(valor);
  if (!Number.isNaN(direto.getTime())) return direto.toISOString();
  // "2026-09-01 11:19:10.361" (horário de Brasília)
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(valor);
  if (m) {
    const iso = new Date(
      `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}-03:00`,
    );
    if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  }
  return new Date().toISOString();
}
