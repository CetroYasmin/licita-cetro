export const moeda = (v?: number | null) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export const numero = (v?: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR"));

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
