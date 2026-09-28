/**
 * Criptografia das senhas dos acessos a portais (AES-256-GCM, Web Crypto).
 *
 * A chave vem do segredo PORTAIS_CRYPTO_KEY (32 bytes em base64) e só existe no
 * servidor. Cada senha usa um IV aleatório, e o id do acesso entra como dado
 * autenticado: um texto cifrado copiado para outra linha do banco não decifra.
 *
 * Se a chave for trocada, as senhas já guardadas deixam de abrir — é preciso
 * cadastrá-las de novo.
 */

const codificar = new TextEncoder();
const decodificar = new TextDecoder();

function paraBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function deBase64(texto: string): Uint8Array {
  const bin = atob(texto);
  const saida = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) saida[i] = bin.charCodeAt(i);
  return saida;
}

async function chave(): Promise<CryptoKey> {
  const bruta = process.env["PORTAIS_CRYPTO_KEY"]?.trim();
  if (!bruta) {
    throw new Error(
      "A chave de criptografia dos acessos ainda não foi configurada (segredo PORTAIS_CRYPTO_KEY).",
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = deBase64(bruta);
  } catch {
    throw new Error("PORTAIS_CRYPTO_KEY inválida: precisa ser 32 bytes em base64.");
  }
  if (bytes.length !== 32) {
    throw new Error("PORTAIS_CRYPTO_KEY inválida: precisa ser 32 bytes em base64.");
  }
  return crypto.subtle.importKey("raw", bytes as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** `contexto` amarra o texto cifrado a uma linha específica (use o id do acesso). */
export async function cifrar(texto: string, contexto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: codificar.encode(contexto) },
      await chave(),
      codificar.encode(texto),
    ),
  );
  const saida = new Uint8Array(iv.length + cifrado.length);
  saida.set(iv, 0);
  saida.set(cifrado, iv.length);
  return `v1:${paraBase64(saida)}`;
}

export async function decifrar(valor: string, contexto: string): Promise<string> {
  if (!valor.startsWith("v1:")) throw new Error("Formato de senha guardada desconhecido.");
  const bytes = deBase64(valor.slice(3));
  const iv = bytes.slice(0, 12);
  const dados = bytes.slice(12);
  try {
    const claro = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: codificar.encode(contexto) },
      await chave(),
      dados,
    );
    return decodificar.decode(claro);
  } catch {
    throw new Error(
      "Não foi possível abrir a senha guardada. A chave de criptografia pode ter sido trocada desde que ela foi salva.",
    );
  }
}
