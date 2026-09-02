import { normalizar } from "@/lib/busca";

/** Motor de palavras-chave: independente de portal e de banco. */
export function combinarPalavras(mensagem: string, palavras: string[]): string[] {
  const texto = normalizar(mensagem);
  if (!texto) return [];
  return palavras.filter((p) => {
    const alvo = normalizar(p);
    return alvo.length > 0 && texto.includes(alvo);
  });
}

export const PALAVRAS_SUGERIDAS = [
  "convocação",
  "documentação",
  "habilitação",
  "recurso",
  "contrarrazões",
  "amostra",
  "proposta",
];
