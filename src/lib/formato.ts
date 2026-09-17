export const moeda = (v?: number | null) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export const numero = (v?: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR"));

/** Aplica máscara em R$ enquanto digita: só dígitos, os 2 últimos são centavos. */
export function aoDigitarMoeda(texto: string): string {
  const digitos = texto.replace(/\D/g, "").slice(0, 13);
  if (!digitos) return "";
  return (Number(digitos) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Texto mascarado em R$ -> número. */
export function numeroDaMoeda(texto: string): number | null {
  const digitos = texto.replace(/\D/g, "");
  if (!digitos) return null;
  return Number(digitos) / 100;
}

/**
 * Nome do órgão sem a duplicação do ente federativo.
 * "MUNICIPIO DE SERRINHA — Prefeitura Municipal de Serrinha" -> "Prefeitura Municipal de Serrinha".
 */
export function nomeOrgao(v?: string | null): string {
  const bruto = (v ?? "").trim();
  if (!bruto) return "—";
  const partes = bruto.split(/\s+[—–-]\s+/).map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return bruto;
  const ente = /^(munic[íi]pio|estado|prefeitura municipal|governo)\s+d[oe]s?\s+/i;
  if (ente.test(partes[0]!)) return partes.slice(1).join(" — ");
  return bruto;
}

export const data = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
};

export const dataHora = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export function contagemRegressiva(alvo?: string | null): string {
  if (!alvo) return "—";
  const diff = new Date(alvo).getTime() - Date.now();
  if (Number.isNaN(diff)) return "—";
  if (diff <= 0) return "encerrado";
  const dias = Math.floor(diff / 86400000);
  const horas = Math.floor((diff % 86400000) / 3600000);
  const min = Math.floor((diff % 3600000) / 60000);
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${min}min`;
  return `${min}min`;
}

export const STATUS_LICITACAO = [
  "publicada",
  "aguardando sessão",
  "em disputa",
  "encerrada",
  "homologada",
  "fracassada",
  "deserta",
  "suspensa",
  "vencida",
  "perdida",
] as const;

export const MODALIDADES = [
  "Pregão Eletrônico",
  "Pregão Presencial",
  "Concorrência Eletrônica",
  "Concorrência Presencial",
  "Dispensa de Licitação",
  "Inexigibilidade",
  "Concurso",
  "Leilão",
  "Credenciamento",
  "Pré-qualificação",
] as const;

export const NATUREZAS = [
  "Obras e engenharia",
  "Serviços",
  "Compras/materiais",
  "Serviços de TI",
  "Locação/concessão",
  "Outros",
] as const;

export const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
] as const;

export function corDoStatus(status?: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "em disputa":
      return "bg-warning/15 text-warning-foreground border-warning/40";
    case "vencida":
    case "homologada":
      return "bg-success/15 text-success border-success/40";
    case "perdida":
    case "fracassada":
    case "deserta":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "suspensa":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-secondary/10 text-secondary border-secondary/30";
  }
}
