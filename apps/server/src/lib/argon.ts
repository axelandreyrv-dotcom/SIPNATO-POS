// argon2id para Workers: el WebAssembly se importa ya compilado (Workers prohíbe compilarlo en
// tiempo de ejecución). Formato PHC, compatible con los hashes de la librería `argon2` de Node
// que usaba el servidor anterior.
import setupWasm from 'argon2id/lib/setup.js';
import simd from 'argon2id/dist/simd.wasm';
import noSimd from 'argon2id/dist/no-simd.wasm';

// Recomendación mínima de OWASP para argon2id; cabe en los 128 MB de un Worker con holgura.
export const ARGON_PARAMS = { m: 19456, t: 2, p: 1 } as const;

const SALT_BYTES = 16;
const TAG_BYTES = 32;

type Compute = (input: {
  password: Uint8Array;
  salt: Uint8Array;
  parallelism: number;
  passes: number;
  memorySize: number;
  tagLength: number;
}) => Uint8Array;

let compute: Promise<Compute> | null = null;
function getCompute(): Promise<Compute> {
  compute ??= setupWasm(
    async (io: WebAssembly.Imports) => ({ instance: await WebAssembly.instantiate(simd, io) }),
    async (io: WebAssembly.Imports) => ({ instance: await WebAssembly.instantiate(noSimd, io) }),
  ) as Promise<Compute>;
  return compute;
}

const encoder = new TextEncoder();
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/;

export async function argonHash(secret: string): Promise<string> {
  const { m, t, p } = ARGON_PARAMS;
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const tag = (await getCompute())({
    password: encoder.encode(secret),
    salt,
    parallelism: p,
    passes: t,
    memorySize: m,
    tagLength: TAG_BYTES,
  });
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${toBase64(salt)}$${toBase64(tag)}`;
}

export async function argonVerify(secret: string, encoded: string): Promise<boolean> {
  const match = PHC.exec(encoded.trim());
  if (!match) return false;
  const [, m, t, p, salt, expected] = match;
  let want: Uint8Array;
  let saltBytes: Uint8Array;
  try {
    want = fromBase64(expected!);
    saltBytes = fromBase64(salt!);
  } catch {
    return false;
  }
  const got = (await getCompute())({
    password: encoder.encode(secret),
    salt: saltBytes,
    parallelism: Number(p),
    passes: Number(t),
    memorySize: Number(m),
    tagLength: want.length,
  });
  if (got.length !== want.length) return false;
  // Comparación sin cortocircuito: no revela cuántos bytes iniciales coinciden.
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i]! ^ want[i]!;
  return diff === 0;
}

// Un hash con otros parámetros (p. ej. los m=65536,t=3,p=4 de la versión Node) se reescribe
// la próxima vez que su dueño inicia sesión. Uno ilegible también: de todos modos no verificaría.
export function needsRehash(encoded: string): boolean {
  const match = PHC.exec(encoded.trim());
  if (!match) return true;
  const { m, t, p } = ARGON_PARAMS;
  return Number(match[1]) !== m || Number(match[2]) !== t || Number(match[3]) !== p;
}
