import { supabase } from "@/integrations/supabase/client";

type Ctx = { equipeId: string; autorId?: string | null; autorNome?: string | null };

export async function registrarMovimentacao(
  ctx: Ctx,
  licitacaoId: string,
  tipo: string,
  descricao: string,
) {
  await supabase.from("movimentacoes").insert({
    licitacao_id: licitacaoId,
    equipe_id: ctx.equipeId,
    tipo,
    descricao,
    autor_id: ctx.autorId ?? null,
    autor_nome: ctx.autorNome ?? null,
  });
  await supabase
    .from("licitacoes")
    .update({ ultima_atualizacao: new Date().toISOString() })
    .eq("id", licitacaoId);
}

export async function registrarAlerta(
  ctx: Ctx,
  licitacaoId: string | null,
  tipo: string,
  titulo: string,
  mensagem?: string,
) {
  await supabase.from("alertas").insert({
    equipe_id: ctx.equipeId,
    licitacao_id: licitacaoId,
    tipo,
    titulo,
    mensagem: mensagem ?? null,
    autor_nome: ctx.autorNome ?? null,
  });
}

export function baixarCsv(nome: string, linhas: Record<string, unknown>[]) {
  if (linhas.length === 0) return;
  const colunas = Object.keys(linhas[0] ?? {});
  const escapar = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    colunas.join(";"),
    ...linhas.map((l) => colunas.map((c) => escapar(l[c])).join(";")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nome}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
