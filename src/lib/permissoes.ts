import type { Papel } from "@/hooks/useAuth";

const TODAS = [
  "/",
  "/licitacoes",
  "/em-andamento",
  "/pesquisa",
  "/agenda",
  "/monitorar-chat",
  "/alertas",
  "/relatorios",
  "/aprovacao",
  "/equipe",
] as const;

const DIRETOR = ["/", "/em-andamento", "/pesquisa", "/agenda", "/alertas", "/relatorios", "/aprovacao"];

const MEMBRO = TODAS.filter((r) => r !== "/aprovacao" && r !== "/equipe");

export function rotasPermitidas(papel: Papel): string[] {
  if (papel === "admin") return [...TODAS];
  if (papel === "diretor") return DIRETOR;
  return [...MEMBRO];
}

export function podeVer(papel: Papel, rota: string): boolean {
  const permitidas = rotasPermitidas(papel);
  if (rota === "/") return permitidas.includes("/");
  return permitidas.some((r) => r !== "/" && rota.startsWith(r));
}
