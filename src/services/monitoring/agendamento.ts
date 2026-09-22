import type { Database } from "@/integrations/supabase/types";

/** Campos da licitação que o worker precisa para decidir e coletar. */
export type LicitacaoMonitorada = Pick<
  Database["public"]["Tables"]["licitacoes"]["Row"],
  | "id"
  | "equipe_id"
  | "numero"
  | "orgao"
  | "status"
  | "data_sessao"
  | "created_at"
  | "chat_conector"
  | "chat_id_externo"
  | "chat_ultima_coleta"
  | "chat_ultima_msg_em"
  | "chat_erros_seguidos"
>;

export type Decisao =
  { acao: "coletar" } | { acao: "aguardar"; motivo: string } | { acao: "encerrar"; motivo: string };

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Situações em que não há mais chat a acompanhar. */
export const STATUS_FINAIS = [
  "homologada",
  "fracassada",
  "deserta",
  "vencida",
  "perdida",
  "declinada",
];

const ANTES_DA_SESSAO = 30 * MIN;
const DEPOIS_DA_SESSAO = 12 * HORA;
/** Sessão suspensa pode voltar dias depois: só reduzimos o ritmo, não desligamos. */
const SEM_MENSAGENS_PARA_DIMINUIR = 3 * DIA;
/** Válvula de segurança para licitações esquecidas com o monitoramento ligado. */
const SEM_MENSAGENS_PARA_ENCERRAR = 30 * DIA;

function tempo(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * Ritmo de coleta: minuto a minuto perto e durante a sessão; espaçado fora dela.
 * O worker é chamado a cada minuto, então 50 s significa "toda rodada".
 */
export function intervaloBase(lic: LicitacaoMonitorada, agora: number): number {
  if (lic.status === "em disputa") return 50_000;
  const sessao = tempo(lic.data_sessao);
  if (sessao == null) return 5 * MIN;
  if (agora >= sessao - ANTES_DA_SESSAO && agora <= sessao + DEPOIS_DA_SESSAO) return 50_000;
  if (agora < sessao) return 15 * MIN;
  const ultimaMsg = tempo(lic.chat_ultima_msg_em);
  if (agora - Math.max(ultimaMsg ?? 0, sessao) > SEM_MENSAGENS_PARA_DIMINUIR) return HORA;
  return 10 * MIN;
}

/** Com falhas seguidas o intervalo dobra (até 30 min) para não martelar um portal fora do ar. */
export function intervaloDe(lic: LicitacaoMonitorada, agora: number): number {
  const base = intervaloBase(lic, agora);
  const erros = lic.chat_erros_seguidos ?? 0;
  if (erros <= 0) return base;
  return Math.min(30 * MIN, Math.max(base, MIN * 2 ** Math.min(erros, 5)));
}

export function decidir(lic: LicitacaoMonitorada, agora: number, forcar = false): Decisao {
  if (!lic.chat_conector || !lic.chat_id_externo) {
    return { acao: "aguardar", motivo: "configuração incompleta" };
  }
  if (STATUS_FINAIS.includes(lic.status)) {
    return { acao: "encerrar", motivo: `situação da licitação: ${lic.status}` };
  }
  // Só entra em jogo depois de já termos tentado ao menos uma vez — do
  // contrário, ligar o monitoramento pela primeira vez numa licitação cuja
  // sessão já passou há mais de 30 dias (um teste retroativo, por exemplo)
  // desligaria sozinho antes mesmo da primeira coleta.
  const jaTentou = tempo(lic.chat_ultima_coleta) != null;
  const referencia = Math.max(tempo(lic.chat_ultima_msg_em) ?? 0, tempo(lic.data_sessao) ?? 0);
  if (jaTentou && referencia > 0 && agora - referencia > SEM_MENSAGENS_PARA_ENCERRAR) {
    return { acao: "encerrar", motivo: "mais de 30 dias sem mensagens" };
  }
  if (forcar) return { acao: "coletar" };

  const ultima = tempo(lic.chat_ultima_coleta) ?? 0;
  return agora - ultima >= intervaloDe(lic, agora)
    ? { acao: "coletar" }
    : { acao: "aguardar", motivo: "fora do intervalo" };
}
