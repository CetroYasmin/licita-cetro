/**
 * Portal da DISPUTA (onde a sessão acontece) — diferente da FONTE de
 * publicação. O PNCP é só onde o edital é divulgado; nunca é tratado aqui
 * como portal da sessão.
 */

export const NAO_E_PORTAL = new Set(["", "pncp", "não informado", "nao informado", "—", "-"]);

export const PORTAL_COMPRASNET = "Compras.gov.br (ComprasNet)";

export function nomePortal(link?: string | null): string {
  if (!link) return "Não informado";
  // O PNCP às vezes devolve texto em português puro (o nome da empresa por
  // trás do sistema, ex. "Licitações-E BB", "ECustomize..."), não uma URL —
  // sem tirar acento e espaço, "licitações-e" nunca bateria com "licitacoes-e",
  // nem "BLL Compras" com "bllcompras". Comparamos sempre sem acento e sem
  // espaço dos dois lados, para não depender de prever cada variação de grafia.
  const normalizar = (v: string) =>
    v
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "");
  const l = normalizar(link);
  const bate = (...termos: string[]) => termos.some((t) => l.includes(normalizar(t)));

  if (bate("comprasnet", "gov.br/compras", "cnetmobile", "compras.gov.br"))
    return "Compras.gov.br (ComprasNet)";
  if (bate("licitacoes-e", "licitacoes-e.com.br", "bb.com.br"))
    return "Licitações-e (Banco do Brasil)";
  if (bate("bllcompras", "bll.org.br", "bll compras")) return "BLL Compras";
  if (bate("bnc.org.br", "bncompras") || /\bbnc\b/.test(l))
    return "BNC — Bolsa Nacional de Compras";
  if (bate("bbmnet", "bbmnet licitacoes")) return "BBMNET Licitações";
  if (bate("portaldecompraspublicas", "portal de compras publicas"))
    return "Portal de Compras Públicas";
  if (bate("licitanet")) return "Licitanet";
  if (bate("licitardigital", "licitar digital")) return "Licitar Digital";
  if (bate("m2atecnologia", "m2a tecnologia", "gestaodecompras", "gestao de compras"))
    return "Gestão de Compras (M2A Tecnologia)";
  if (bate("s2gpr", "seplag.ce.gov.br", "licitacoes.ce.gov.br")) return "S2GPR (Governo do Ceará)";
  if (bate("bec.sp.gov.br")) return "BEC/SP";
  if (bate("compras.rs", "cel.rs")) return "Compras RS";
  if (bate("centraldecompras.pb.gov.br", "central de compras pb")) return "Central de Compras PB";
  if (bate("comprasbr")) return "ComprasBR";
  if (bate("publinexo")) return "Publinexo";
  if (bate("effecti")) return "Effecti";
  if (bate("startgov")) return "Compras MA (SIGA)";
  // Empresa por trás do Portal de Compras Públicas — o "Fonte:" do PNCP
  // mostra a razão social, não a marca (vistos em 23/09: Coordenadoria de
  // Fomento a Irrigação-PI, Mossoró-RN, Serrinha-RN, Timon-MA).
  if (bate("ecustomize")) return "Portal de Compras Públicas";
  // Vistos em 23/09: Caucaia-CE (Licita + Brasil) e Natal-RN (BR Conectado).
  if (bate("licita + brasil", "licitamaisbrasil")) return "Licita Mais Brasil";
  if (bate("br conectado", "brconectado")) return "BR Conectado";
  if (bate("pncp.gov.br")) return "PNCP";
  try {
    return `${new URL(link.startsWith("http") ? link : `https://${link}`).hostname.replace("www.", "")}`;
  } catch {
    return "Não informado";
  }
}

/** Nome do portal da disputa para exibição, ou null quando ainda não se sabe. */
export function portalDisputaDe(l: { portal?: string | null; portal_manual?: boolean | null }): string | null {
  const p = (l.portal ?? "").trim();
  if (!p) return null;
  if (!l.portal_manual && NAO_E_PORTAL.has(p.toLowerCase())) return null;
  return p;
}

export function rotuloPortal(l: { portal?: string | null; portal_manual?: boolean | null }): string {
  return `Portal: ${portalDisputaDe(l) ?? "a identificar"}`;
}

/**
 * Compras.gov.br: o link público da compra traz `compra=` com 17 dígitos
 * (UASG 6 + modalidade 2 + número 5 + ano 4). Só aceitamos esse formato —
 * ele identifica a compra sem ambiguidade para o conector.
 */
export function idCompraComprasNet(link?: string | null): string | null {
  if (!link) return null;
  try {
    const u = new URL(link);
    const host = u.hostname.toLowerCase();
    if (!/(compras\.gov\.br|comprasnet\.gov\.br|serpro\.gov\.br)$/.test(host)) return null;
    const cand = [u.searchParams.get("compra"), u.searchParams.get("idCompra")].find(
      (v) => v && /^\d{17}$/.test(v),
    );
    if (!cand) return null;
    return `${Number(cand.slice(0, 6))}-${Number(cand.slice(6, 8))}-${Number(cand.slice(8, 13))}-${cand.slice(13)}`;
  } catch {
    return null;
  }
}

export type StatusChat =
  | "monitorando"
  | "aguardando_credencial"
  | "sem_id"
  | "coleta_indisponivel"
  | "portal_desconhecido"
  | "encerrado"
  | "manual";

export const ROTULO_STATUS_CHAT: Record<StatusChat, string> = {
  monitorando: "Monitorando",
  aguardando_credencial: "Aguardando credencial do portal",
  sem_id: "Falta o identificador da compra",
  coleta_indisponivel: "Portal identificado / coleta ainda não disponível",
  portal_desconhecido: "Portal a identificar",
  encerrado: "Monitoramento encerrado",
  manual: "Configurado manualmente",
};
