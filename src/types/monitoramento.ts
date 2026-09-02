/** Tipos compartilhados do monitoramento de chats de licitações. */

export type AutorTipo = "pregoeiro" | "sistema" | "licitante" | "equipe";

/** Mensagem já normalizada, independente do portal de origem. */
export type ChatMessage = {
  /** Identificador da mensagem no portal. Quando ausente, o normalizador gera um hash. */
  external_message_id?: string | null;
  author: string;
  author_type: AutorTipo;
  message: string;
  /** ISO 8601 */
  message_timestamp: string;
};

/** Licitação exposta por um portal. */
export type Auction = {
  external_id: string;
  title: string;
  agency?: string | null;
  objeto?: string | null;
  status?: string | null;
  /** ISO 8601 */
  opening_date?: string | null;
};

export type Portal = {
  id: string;
  nome: string;
  slug: string;
  base_url: string | null;
  ativo: boolean;
  connector_type: string;
};

export type Pregao = {
  id: string;
  portal_id: string;
  external_id: string;
  titulo: string;
  orgao: string | null;
  objeto: string | null;
  status: string;
  data_abertura: string | null;
  monitoramento_ativo: boolean;
};

export type MensagemPersistida = {
  id: string;
  pregao_id: string;
  portal_id: string;
  external_message_id: string;
  autor: string;
  autor_tipo: string;
  mensagem: string;
  mensagem_em: string;
  coletada_em: string;
};
