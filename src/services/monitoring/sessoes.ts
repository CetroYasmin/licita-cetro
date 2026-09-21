import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { SessionStore } from "@/connectors/PortalConnector";

/**
 * Persistência do token de sessão dos connectors. Precisa de um client com
 * service_role: a tabela conector_sessoes não tem acesso para usuários.
 */
export function sessaoStore(db: SupabaseClient<Database>): SessionStore {
  return {
    async carregar(slug) {
      const { data } = await db
        .from("conector_sessoes")
        .select("token")
        .eq("slug", slug)
        .maybeSingle();
      return data?.token ?? null;
    },
    async salvar(slug, token) {
      const { error } = await db
        .from("conector_sessoes")
        .upsert({ slug, token, atualizado_em: new Date().toISOString() }, { onConflict: "slug" });
      if (error) throw error;
    },
  };
}
