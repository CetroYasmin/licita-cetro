export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alertas: {
        Row: {
          autor_nome: string | null
          created_at: string
          equipe_id: string
          id: string
          licitacao_id: string | null
          lida: boolean
          mensagem: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          autor_nome?: string | null
          created_at?: string
          equipe_id: string
          id?: string
          licitacao_id?: string | null
          lida?: boolean
          mensagem?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          autor_nome?: string | null
          created_at?: string
          equipe_id?: string
          id?: string
          licitacao_id?: string | null
          lida?: boolean
          mensagem?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      anotacoes_pesquisa: {
        Row: {
          autor_id: string | null
          autor_nome: string | null
          created_at: string
          equipe_id: string
          fonte_id: string
          id: string
          texto: string
          updated_at: string
        }
        Insert: {
          autor_id?: string | null
          autor_nome?: string | null
          created_at?: string
          equipe_id: string
          fonte_id: string
          id?: string
          texto?: string
          updated_at?: string
        }
        Update: {
          autor_id?: string | null
          autor_nome?: string | null
          created_at?: string
          equipe_id?: string
          fonte_id?: string
          id?: string
          texto?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anotacoes_pesquisa_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_mensagens: {
        Row: {
          autor: string
          created_at: string
          enviada_em: string
          equipe_id: string
          externo_id: string | null
          id: string
          licitacao_id: string
          lida: boolean
          mensagem: string
          origem: string
          papel: string
          referencia_externa: string | null
        }
        Insert: {
          autor: string
          created_at?: string
          enviada_em?: string
          equipe_id: string
          externo_id?: string | null
          id?: string
          licitacao_id: string
          lida?: boolean
          mensagem: string
          origem?: string
          papel?: string
          referencia_externa?: string | null
        }
        Update: {
          autor?: string
          created_at?: string
          enviada_em?: string
          equipe_id?: string
          externo_id?: string | null
          id?: string
          licitacao_id?: string
          lida?: boolean
          mensagem?: string
          origem?: string
          papel?: string
          referencia_externa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_mensagens_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      concorrentes: {
        Row: {
          cnpj: string | null
          created_at: string
          equipe_id: string
          id: string
          licitacao_id: string
          nome: string
          posicao: number | null
          situacao: string | null
          valor_ofertado: number | null
          vencedor: boolean
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          equipe_id: string
          id?: string
          licitacao_id: string
          nome: string
          posicao?: number | null
          situacao?: string | null
          valor_ofertado?: number | null
          vencedor?: boolean
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          equipe_id?: string
          id?: string
          licitacao_id?: string
          nome?: string
          posicao?: number | null
          situacao?: string | null
          valor_ofertado?: number | null
          vencedor?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "concorrentes_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concorrentes_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          created_at: string
          equipe_id: string
          id: string
          licitacao_id: string
          nome: string
          publicado_em: string | null
          storage_path: string | null
          tipo: string
          url: string | null
        }
        Insert: {
          created_at?: string
          equipe_id: string
          id?: string
          licitacao_id: string
          nome: string
          publicado_em?: string | null
          storage_path?: string | null
          tipo?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          equipe_id?: string
          id?: string
          licitacao_id?: string
          nome?: string
          publicado_em?: string | null
          storage_path?: string | null
          tipo?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipes: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      lances: {
        Row: {
          cnpj: string | null
          empresa: string
          equipe_id: string
          id: string
          item_id: string | null
          licitacao_id: string
          minha_empresa: boolean
          posicao: number | null
          registrado_em: string
          valor: number
        }
        Insert: {
          cnpj?: string | null
          empresa: string
          equipe_id: string
          id?: string
          item_id?: string | null
          licitacao_id: string
          minha_empresa?: boolean
          posicao?: number | null
          registrado_em?: string
          valor: number
        }
        Update: {
          cnpj?: string | null
          empresa?: string
          equipe_id?: string
          id?: string
          item_id?: string | null
          licitacao_id?: string
          minha_empresa?: boolean
          posicao?: number | null
          registrado_em?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lances_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lances_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "licitacao_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lances_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacao_itens: {
        Row: {
          created_at: string
          descricao: string | null
          empresa_vencedora: string | null
          equipe_id: string
          id: string
          licitacao_id: string
          lote: string | null
          melhor_valor: number | null
          numero_item: string | null
          participando: boolean
          posicao_empresa: number | null
          quantidade: number | null
          situacao: string | null
          unidade: string | null
          valor_ofertado: number | null
          valor_total_estimado: number | null
          valor_unitario_estimado: number | null
          valor_vencedor: number | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          empresa_vencedora?: string | null
          equipe_id: string
          id?: string
          licitacao_id: string
          lote?: string | null
          melhor_valor?: number | null
          numero_item?: string | null
          participando?: boolean
          posicao_empresa?: number | null
          quantidade?: number | null
          situacao?: string | null
          unidade?: string | null
          valor_ofertado?: number | null
          valor_total_estimado?: number | null
          valor_unitario_estimado?: number | null
          valor_vencedor?: number | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          empresa_vencedora?: string | null
          equipe_id?: string
          id?: string
          licitacao_id?: string
          lote?: string | null
          melhor_valor?: number | null
          numero_item?: string | null
          participando?: boolean
          posicao_empresa?: number | null
          quantidade?: number | null
          situacao?: string | null
          unidade?: string | null
          valor_ofertado?: number | null
          valor_total_estimado?: number | null
          valor_unitario_estimado?: number | null
          valor_vencedor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "licitacao_itens_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licitacao_itens_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacoes: {
        Row: {
          aprovacao_autor_id: string | null
          aprovacao_autor_nome: string | null
          aprovacao_em: string | null
          aprovacao_observacao: string | null
          aprovacao_resposta: string | null
          aprovacao_resposta_autor_nome: string | null
          aprovacao_resposta_em: string | null
          aprovacao_resposta_solicitada: boolean
          aprovacao_status: string
          cidade: string | null
          created_at: string
          created_by: string | null
          data_abertura: string | null
          data_publicacao: string | null
          data_sessao: string | null
          equipe_id: string
          favorito: boolean
          fonte: string | null
          fonte_id: string | null
          id: string
          melhor_valor: number | null
          modalidade: string | null
          motivo_desclassificacao: string | null
          natureza: string | null
          numero: string
          objeto: string | null
          observacoes: string | null
          orgao: string | null
          pasta_id: string | null
          plataforma: string | null
          portal: string | null
          posicao_empresa: number | null
          processo_administrativo: string | null
          proximo_evento: string | null
          proximo_evento_data: string | null
          qtd_concorrentes: number | null
          qtd_itens: number | null
          qtd_lotes: number | null
          qualificacao_tecnica: string | null
          responsavel_id: string | null
          resultado_final: string | null
          site_url: string | null
          situacao_empresa: string | null
          situacao_proposta: string | null
          status: string
          tags: string[]
          uf: string | null
          ultima_atualizacao: string
          updated_at: string
          valor_estimado: number | null
          valor_ofertado: number | null
        }
        Insert: {
          aprovacao_autor_id?: string | null
          aprovacao_autor_nome?: string | null
          aprovacao_em?: string | null
          aprovacao_observacao?: string | null
          aprovacao_resposta?: string | null
          aprovacao_resposta_autor_nome?: string | null
          aprovacao_resposta_em?: string | null
          aprovacao_resposta_solicitada?: boolean
          aprovacao_status?: string
          cidade?: string | null
          created_at?: string
          created_by?: string | null
          data_abertura?: string | null
          data_publicacao?: string | null
          data_sessao?: string | null
          equipe_id: string
          favorito?: boolean
          fonte?: string | null
          fonte_id?: string | null
          id?: string
          melhor_valor?: number | null
          modalidade?: string | null
          motivo_desclassificacao?: string | null
          natureza?: string | null
          numero: string
          objeto?: string | null
          observacoes?: string | null
          orgao?: string | null
          pasta_id?: string | null
          plataforma?: string | null
          portal?: string | null
          posicao_empresa?: number | null
          processo_administrativo?: string | null
          proximo_evento?: string | null
          proximo_evento_data?: string | null
          qtd_concorrentes?: number | null
          qtd_itens?: number | null
          qtd_lotes?: number | null
          qualificacao_tecnica?: string | null
          responsavel_id?: string | null
          resultado_final?: string | null
          site_url?: string | null
          situacao_empresa?: string | null
          situacao_proposta?: string | null
          status?: string
          tags?: string[]
          uf?: string | null
          ultima_atualizacao?: string
          updated_at?: string
          valor_estimado?: number | null
          valor_ofertado?: number | null
        }
        Update: {
          aprovacao_autor_id?: string | null
          aprovacao_autor_nome?: string | null
          aprovacao_em?: string | null
          aprovacao_observacao?: string | null
          aprovacao_resposta?: string | null
          aprovacao_resposta_autor_nome?: string | null
          aprovacao_resposta_em?: string | null
          aprovacao_resposta_solicitada?: boolean
          aprovacao_status?: string
          cidade?: string | null
          created_at?: string
          created_by?: string | null
          data_abertura?: string | null
          data_publicacao?: string | null
          data_sessao?: string | null
          equipe_id?: string
          favorito?: boolean
          fonte?: string | null
          fonte_id?: string | null
          id?: string
          melhor_valor?: number | null
          modalidade?: string | null
          motivo_desclassificacao?: string | null
          natureza?: string | null
          numero?: string
          objeto?: string | null
          observacoes?: string | null
          orgao?: string | null
          pasta_id?: string | null
          plataforma?: string | null
          portal?: string | null
          posicao_empresa?: number | null
          processo_administrativo?: string | null
          proximo_evento?: string | null
          proximo_evento_data?: string | null
          qtd_concorrentes?: number | null
          qtd_itens?: number | null
          qtd_lotes?: number | null
          qualificacao_tecnica?: string | null
          responsavel_id?: string | null
          resultado_final?: string | null
          site_url?: string | null
          situacao_empresa?: string | null
          situacao_proposta?: string | null
          status?: string
          tags?: string[]
          uf?: string | null
          ultima_atualizacao?: string
          updated_at?: string
          valor_estimado?: number | null
          valor_ofertado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "licitacoes_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoramentos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          pregao_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          pregao_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          pregao_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoramentos_pregao_id_fkey"
            columns: ["pregao_id"]
            isOneToOne: false
            referencedRelation: "pregoes"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentacoes: {
        Row: {
          autor_id: string | null
          autor_nome: string | null
          created_at: string
          descricao: string
          equipe_id: string
          id: string
          licitacao_id: string
          ocorrido_em: string
          tipo: string
        }
        Insert: {
          autor_id?: string | null
          autor_nome?: string | null
          created_at?: string
          descricao: string
          equipe_id: string
          id?: string
          licitacao_id: string
          ocorrido_em?: string
          tipo?: string
        }
        Update: {
          autor_id?: string | null
          autor_nome?: string | null
          created_at?: string
          descricao?: string
          equipe_id?: string
          id?: string
          licitacao_id?: string
          ocorrido_em?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          corpo: string | null
          created_at: string
          id: string
          lida: boolean
          mensagem_id: string | null
          palavra: string | null
          pregao_id: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          corpo?: string | null
          created_at?: string
          id?: string
          lida?: boolean
          mensagem_id?: string | null
          palavra?: string | null
          pregao_id?: string | null
          tipo?: string
          titulo: string
          user_id: string
        }
        Update: {
          corpo?: string | null
          created_at?: string
          id?: string
          lida?: boolean
          mensagem_id?: string | null
          palavra?: string | null
          pregao_id?: string | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "pregao_mensagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_pregao_id_fkey"
            columns: ["pregao_id"]
            isOneToOne: false
            referencedRelation: "pregoes"
            referencedColumns: ["id"]
          },
        ]
      }
      palavras_chave: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          palavra: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          palavra: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          palavra?: string
          user_id?: string
        }
        Relationships: []
      }
      pastas: {
        Row: {
          cor: string | null
          created_at: string
          equipe_id: string
          id: string
          nome: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          equipe_id: string
          id?: string
          nome: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          equipe_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "pastas_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      portais: {
        Row: {
          ativo: boolean
          base_url: string | null
          connector_type: string
          created_at: string
          id: string
          nome: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          base_url?: string | null
          connector_type?: string
          created_at?: string
          id?: string
          nome: string
          slug: string
        }
        Update: {
          ativo?: boolean
          base_url?: string | null
          connector_type?: string
          created_at?: string
          id?: string
          nome?: string
          slug?: string
        }
        Relationships: []
      }
      portais_acessos: {
        Row: {
          cpf: string | null
          created_at: string
          equipe_id: string
          id: string
          login: string | null
          nome: string
          senha: string | null
          tipo: string
          updated_at: string
          url: string | null
          vencimento: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          equipe_id: string
          id?: string
          login?: string | null
          nome: string
          senha?: string | null
          tipo?: string
          updated_at?: string
          url?: string | null
          vencimento?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          equipe_id?: string
          id?: string
          login?: string | null
          nome?: string
          senha?: string | null
          tipo?: string
          updated_at?: string
          url?: string | null
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portais_acessos_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      portais_config: {
        Row: {
          ativo: boolean
          created_at: string
          equipe_id: string
          id: string
          nome: string
          observacoes: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          equipe_id: string
          id?: string
          nome: string
          observacoes?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          equipe_id?: string
          id?: string
          nome?: string
          observacoes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portais_config_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      prazos: {
        Row: {
          concluido: boolean
          created_at: string
          data_limite: string
          descricao: string | null
          equipe_id: string
          id: string
          licitacao_id: string
          tipo: string
        }
        Insert: {
          concluido?: boolean
          created_at?: string
          data_limite: string
          descricao?: string | null
          equipe_id: string
          id?: string
          licitacao_id: string
          tipo: string
        }
        Update: {
          concluido?: boolean
          created_at?: string
          data_limite?: string
          descricao?: string | null
          equipe_id?: string
          id?: string
          licitacao_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "prazos_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prazos_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      pregao_mensagens: {
        Row: {
          autor: string
          autor_tipo: string
          coletada_em: string
          created_at: string
          equipe_id: string | null
          external_message_id: string
          id: string
          mensagem: string
          mensagem_em: string
          portal_id: string
          pregao_id: string
        }
        Insert: {
          autor: string
          autor_tipo?: string
          coletada_em?: string
          created_at?: string
          equipe_id?: string | null
          external_message_id: string
          id?: string
          mensagem: string
          mensagem_em?: string
          portal_id: string
          pregao_id: string
        }
        Update: {
          autor?: string
          autor_tipo?: string
          coletada_em?: string
          created_at?: string
          equipe_id?: string | null
          external_message_id?: string
          id?: string
          mensagem?: string
          mensagem_em?: string
          portal_id?: string
          pregao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pregao_mensagens_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pregao_mensagens_portal_id_fkey"
            columns: ["portal_id"]
            isOneToOne: false
            referencedRelation: "portais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pregao_mensagens_pregao_id_fkey"
            columns: ["pregao_id"]
            isOneToOne: false
            referencedRelation: "pregoes"
            referencedColumns: ["id"]
          },
        ]
      }
      pregoes: {
        Row: {
          created_at: string
          data_abertura: string | null
          equipe_id: string | null
          external_id: string
          id: string
          monitoramento_ativo: boolean
          objeto: string | null
          orgao: string | null
          portal_id: string
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_abertura?: string | null
          equipe_id?: string | null
          external_id: string
          id?: string
          monitoramento_ativo?: boolean
          objeto?: string | null
          orgao?: string | null
          portal_id: string
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_abertura?: string | null
          equipe_id?: string | null
          external_id?: string
          id?: string
          monitoramento_ativo?: boolean
          objeto?: string | null
          orgao?: string | null
          portal_id?: string
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pregoes_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pregoes_portal_id_fkey"
            columns: ["portal_id"]
            isOneToOne: false
            referencedRelation: "portais"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          empresa_cnpj: string | null
          empresa_nome: string | null
          equipe_id: string | null
          id: string
          nome: string | null
          status: Database["public"]["Enums"]["perfil_status"]
          telefone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          empresa_cnpj?: string | null
          empresa_nome?: string | null
          equipe_id?: string | null
          id: string
          nome?: string | null
          status?: Database["public"]["Enums"]["perfil_status"]
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          empresa_cnpj?: string | null
          empresa_nome?: string | null
          equipe_id?: string | null
          id?: string
          nome?: string | null
          status?: Database["public"]["Enums"]["perfil_status"]
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          concluida: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          equipe_id: string
          id: string
          licitacao_id: string | null
          prazo: string | null
          responsavel_id: string | null
          titulo: string
        }
        Insert: {
          concluida?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          equipe_id: string
          id?: string
          licitacao_id?: string | null
          prazo?: string | null
          responsavel_id?: string | null
          titulo: string
        }
        Update: {
          concluida?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          equipe_id?: string
          id?: string
          licitacao_id?: string | null
          prazo?: string | null
          responsavel_id?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visualizacoes: {
        Row: {
          created_at: string
          equipe_id: string
          fonte_id: string | null
          id: string
          licitacao_id: string | null
          user_id: string
          user_nome: string | null
        }
        Insert: {
          created_at?: string
          equipe_id: string
          fonte_id?: string | null
          id?: string
          licitacao_id?: string | null
          user_id: string
          user_nome?: string | null
        }
        Update: {
          created_at?: string
          equipe_id?: string
          fonte_id?: string | null
          id?: string
          licitacao_id?: string | null
          user_id?: string
          user_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visualizacoes_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visualizacoes_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_equipe_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "membro" | "diretor"
      perfil_status: "pendente" | "aprovado" | "bloqueado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "membro", "diretor"],
      perfil_status: ["pendente", "aprovado", "bloqueado"],
    },
  },
} as const
