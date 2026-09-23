import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "atualizar_qualificacao_tecnica",
  title: "Atualizar qualificação técnica",
  description: "Grava o texto da qualificação técnica exigida pelo edital em uma licitação.",
  inputSchema: {
    id: z.string().uuid().describe("ID da licitação."),
    texto: z.string().trim().max(5000).describe("Qualificação técnica exigida."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, texto }, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("licitacoes")
      .update({ qualificacao_tecnica: texto })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new ToolError(error.message);
    if (!data) throw new ToolError("Licitação não encontrada.");
    return { content: [{ type: "text", text: "Qualificação técnica atualizada." }] };
  },
});
