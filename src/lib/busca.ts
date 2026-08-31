/** Utilitários de busca textual tolerante (acentos, plural, erros de digitação). */

export function normalizar(texto?: string | null): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const VAZIAS = new Set([
  "de","da","do","das","dos","e","a","o","as","os","em","para","por","com","no","na","nos","nas","um","uma","ao","aos",
]);

function tokens(texto: string): string[] {
  return normalizar(texto).split(" ").filter((t) => t.length > 2 && !VAZIAS.has(t));
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let anterior = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const atual = [i];
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
    }
    anterior = atual;
  }
  return anterior[n];
}

export function similaridade(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maior = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maior;
}

function palavraSemelhante(termo: string, alvos: string[]): boolean {
  const raiz = termo.slice(0, Math.max(4, termo.length - 2));
  for (const alvo of alvos) {
    if (alvo === termo) return true;
    if (alvo.startsWith(raiz) || termo.startsWith(alvo.slice(0, Math.max(4, alvo.length - 2)))) return true;
    if (similaridade(termo, alvo) >= 0.82) return true;
  }
  return false;
}

/**
 * Interpreta a consulta: vírgulas, ponto-e-vírgula ou " ou " separam alternativas.
 * Trechos entre aspas são tratados como frase exata (tolerante a acentos).
 */
export function alternativas(consulta: string): Array<{ frase: string; termos: string[]; exata: boolean }> {
  return consulta
    .split(/[,;]|\s+ou\s+/i)
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => {
      const exata = /^".*"$/.test(parte);
      const limpo = parte.replace(/"/g, "");
      return { frase: normalizar(limpo), termos: tokens(limpo), exata };
    })
    .filter((a) => a.frase.length > 0);
}

/** Retorna 0 (sem relação) a 1 (aderência total) entre a consulta e o texto. */
export function relevancia(texto: string, consulta: string): number {
  const grupos = alternativas(consulta);
  if (grupos.length === 0) return 1;
  const textoNorm = normalizar(texto);
  const alvos = textoNorm.split(" ");
  let melhor = 0;

  for (const grupo of grupos) {
    if (textoNorm.includes(grupo.frase)) {
      melhor = Math.max(melhor, 1);
      continue;
    }
    if (grupo.exata) continue;
    if (grupo.termos.length === 0) continue;
    let encontrados = 0;
    for (const termo of grupo.termos) {
      if (textoNorm.includes(termo) || palavraSemelhante(termo, alvos)) encontrados++;
    }
    melhor = Math.max(melhor, (encontrados / grupo.termos.length) * 0.95);
  }
  return melhor;
}

export function combina(texto: string, consulta: string, minimo = 0.6): boolean {
  if (!consulta.trim()) return true;
  return relevancia(texto, consulta) >= minimo;
}
