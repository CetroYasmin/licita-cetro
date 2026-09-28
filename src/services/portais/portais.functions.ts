import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cifrar, decifrar } from "./cripto";

type Cliente = SupabaseClient<Database>;

const idSchema = z.object({ acesso_id: z.string().uuid() });
const definirSchema = z.object({
  acesso_id: z.string().uuid(),
  senha: z.string().min(1, "Digite a senha.").max(200, "Senha longa demais."),
});

/** O acesso precisa ser visível para o usuário (as regras da equipe valem aqui). */
async function acessoVisivel(supabase: Cliente, acessoId: string) {
  const { data, error } = await supabase
    .from("portais_acessos")
    .select("id, equipe_id, nome")
    .eq("id", acessoId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Acesso não encontrado.");
  return data;
}

async function nomeDe(supabase: Cliente, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("nome, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.nome ?? data?.email ?? null;
}

async function registrar(
  supabase: Cliente,
  userId: string,
  acesso: { id: string; equipe_id: string },
  acao: "definiu_senha" | "removeu_senha" | "revelou_senha",
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("portais_acessos_auditoria").insert({
    acesso_id: acesso.id,
    equipe_id: acesso.equipe_id,
    user_id: userId,
    user_nome: await nomeDe(supabase, userId),
    acao,
  });
  // Auditoria com falha não deve esconder a operação já feita, mas fica no log.
  if (error) console.error("[portais] falha ao registrar auditoria:", error.message);
}

/** Qualquer membro da equipe pode cadastrar/trocar a senha (só escreve, não lê). */
export const definirSenhaAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => definirSchema.parse(input))
  .handler(async ({ data, context }) => {
    const acesso = await acessoVisivel(context.supabase, data.acesso_id);
    const cifrada = await cifrar(data.senha, acesso.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("portais_credenciais").upsert(
      {
        acesso_id: acesso.id,
        senha_cifrada: cifrada,
        atualizado_em: new Date().toISOString(),
        atualizado_por: context.userId,
      },
      { onConflict: "acesso_id" },
    );
    if (error) throw new Error("Não foi possível guardar a senha.");
    const { error: e2 } = await supabaseAdmin
      .from("portais_acessos")
      .update({ tem_senha: true })
      .eq("id", acesso.id);
    if (e2) throw new Error("Senha guardada, mas o acesso não foi marcado. Tente salvar de novo.");
    await registrar(context.supabase, context.userId, acesso, "definiu_senha");
    return { ok: true as const };
  });

export const removerSenhaAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const acesso = await acessoVisivel(context.supabase, data.acesso_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("portais_credenciais")
      .delete()
      .eq("acesso_id", acesso.id);
    if (error) throw new Error("Não foi possível remover a senha.");
    await supabaseAdmin.from("portais_acessos").update({ tem_senha: false }).eq("id", acesso.id);
    await registrar(context.supabase, context.userId, acesso, "removeu_senha");
    return { ok: true as const };
  });

/** Só administradores e diretores veem a senha; cada revelação fica registrada. */
export const revelarSenhaAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: papeis, error: erroPapel } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (erroPapel) throw erroPapel;
    if (!papeis?.some((r) => r.role === "admin" || r.role === "diretor")) {
      throw new Error("Somente administradores e diretores podem ver senhas.");
    }
    const acesso = await acessoVisivel(context.supabase, data.acesso_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cred, error } = await supabaseAdmin
      .from("portais_credenciais")
      .select("senha_cifrada")
      .eq("acesso_id", acesso.id)
      .maybeSingle();
    if (error) throw new Error("Não foi possível ler a senha.");
    if (!cred) throw new Error("Este acesso não tem senha guardada.");
    const senha = await decifrar(cred.senha_cifrada, acesso.id);
    await registrar(context.supabase, context.userId, acesso, "revelou_senha");
    return { senha };
  });
