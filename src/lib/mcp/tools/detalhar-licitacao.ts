import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "detalhar_licitacao",
  title: "Detalhar licitação",
  description: "Mostra os dados completos de uma licitação acompanhada, incluindo itens e prazos.",
  inputSchema: { id: z.string().uuid().describe("ID da licitação.") },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    const sb = supabaseForUser(ctx);
    const [lic, itens, prazos] = await Promise.all([
      sb.from("licitacoes").select("*").eq("id", id).maybeSingle(),
      sb.from("licitacao_itens").select("*").eq("licitacao_id", id),
      sb.from("prazos").select("*").eq("licitacao_id", id),
    ]);
    if (lic.error) throw new ToolError(lic.error.message);
    if (!lic.data) throw new ToolError("Licitação não encontrada.");
    const texto = JSON.stringify({ licitacao: lic.data, itens: itens.data ?? [], prazos: prazos.data ?? [] });
    return { content: [{ type: "text", text: texto }] };
  },
});
