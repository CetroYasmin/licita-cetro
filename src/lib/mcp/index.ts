import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listarLicitacoes from "./tools/listar-licitacoes";
import detalharLicitacao from "./tools/detalhar-licitacao";
import atualizarQualificacao from "./tools/atualizar-qualificacao";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "licita-cetro",
  title: "Licita Cetro",
  version: "0.1.0",
  instructions:
    "Ferramentas das Licitações Cetro. Use `listar_licitacoes` para ver as licitações acompanhadas pela equipe, `detalhar_licitacao` para detalhes e `atualizar_qualificacao_tecnica` para registrar a qualificação técnica.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listarLicitacoes, detalharLicitacao, atualizarQualificacao],
});
