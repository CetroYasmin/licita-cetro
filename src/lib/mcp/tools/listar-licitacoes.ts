import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "listar_licitacoes",
  title: "Listar licitações",
  description: "Lista as licitações acompanhadas pela equipe, com filtro opcional por texto e situação.",
  inputSchema: {
    busca: z.string().trim().max(200).optional().describe("Texto no objeto ou órgão."),
    status: z.string().trim().max(40).optional().describe("Situação, ex.: em_andamento, declinada."),
    limite: z.number().int().min(1).max(100).default(30),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ busca, status, limite }, ctx) => {
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("licitacoes")
      .select("id, numero, orgao, objeto, status, aprovacao_status, valor_estimado, data_sessao, proximo_evento_data")
      .order("data_sessao", { ascending: false, nullsFirst: false })
      .limit(limite);
    if (status) q = q.eq("status", status);
    if (busca) q = q.or(`objeto.ilike.%${busca.replace(/[,%()]/g, " ")}%,orgao.ilike.%${busca.replace(/[,%()]/g, " ")}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const itens = (data ?? []).map((l) => ({
      id: String(l.id),
      numero: l.numero ?? null,
      orgao: l.orgao ?? null,
      objeto: l.objeto ?? null,
      status: l.status ?? null,
      aprovacao: l.aprovacao_status ?? null,
      valor_estimado: l.valor_estimado == null ? null : Number(l.valor_estimado),
      sessao: l.proximo_evento_data ?? l.data_sessao ?? null,
    }));
    return { content: [{ type: "text", text: JSON.stringify(itens) }], structuredContent: { licitacoes: itens } };
  },
});
