/**
 * Consola de operaciones de emergencia: llama a POST /internal/ops del panel (admin.<dominio>).
 * Corre en Node, en la computadora de quien opera; no es parte del Worker.
 *
 *   pnpm ops <comando> [clave=valor …] [--url https://admin.dosuxsoft.com]
 *
 * El token se lee SOLO de la variable de entorno OPS_TOKEN (nunca como argumento, para que no
 * quede en el historial de la terminal) y nunca se imprime.
 *
 * Comandos:
 *   superadmin-create username=<u>    superadmin-reset username=<u>    superadmin-list
 *   superadmin-disable username=<u>   superadmin-enable username=<u>
 *   tenant-list   tenant-create slug=<s> name="<nombre>"   tenant-suspend slug=<s>
 *   tenant-activate slug=<s>   tenant-delete slug=<s> (solo suspendidos, irreversible)
 *   setup-code slug=<s>   reset-owner slug=<s>
 *   bookmarks slug=<s>   restore-tenant slug=<s> bookmark=<b>
 */

const DEFAULT_URL = 'https://admin.dosuxsoft.com';

function fail(message: string): never {
  console.error(`[ops] ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): { command: string; args: Record<string, string>; url: string } {
  let url = DEFAULT_URL;
  const rest: { arg: string; position: number }[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--url') {
      const value = argv[++i];
      if (!value) fail('Falta el valor de --url');
      url = value;
    } else if (arg.startsWith('--url=')) {
      url = arg.slice('--url='.length);
    } else if (arg.startsWith('-')) {
      // Solo la posición: el texto podría ser un secreto pegado por error.
      fail(`Opción desconocida en la posición ${i + 1}`);
    } else {
      rest.push({ arg, position: i + 1 });
    }
  }

  const [first, ...pairs] = rest;
  if (!first) fail('Uso: pnpm ops <comando> [clave=valor …] [--url <base>]');
  const command = first.arg;

  const args: Record<string, string> = {};
  for (const { arg: pair, position } of pairs) {
    const eq = pair.indexOf('=');
    if (eq <= 0) fail(`Argumento inválido en la posición ${position}: se espera clave=valor`);
    const key = pair.slice(0, eq);
    if (/token/i.test(key)) fail('El token va solo en la variable de entorno OPS_TOKEN');
    args[key] = pair.slice(eq + 1);
  }
  return { command, args, url };
}

// El token solo viaja cifrado; http solo hacia la propia máquina (wrangler dev).
function opsEndpoint(base: string): URL {
  let url: URL;
  try {
    url = new URL('/internal/ops', base);
  } catch {
    fail(`URL inválida: ${base}`);
  }
  const local =
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost') ||
    url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    fail('La URL debe ser https:// (http:// solo para localhost)');
  }
  return url;
}

async function main(): Promise<void> {
  const { command, args, url } = parseArgs(process.argv.slice(2));
  const token = process.env['OPS_TOKEN'];
  if (!token) fail('Falta la variable de entorno OPS_TOKEN');

  const endpoint = opsEndpoint(url);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  // `wrangler dev` en http://localhost:<puerto>: el Worker de desarrollo elige el panel por este
  // header (en producción se ignora). Node no resuelve admin.localhost en todas las máquinas.
  if (endpoint.hostname === 'localhost' || endpoint.hostname === '127.0.0.1') {
    headers['X-Forwarded-Host'] = 'admin.localhost';
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ command, args }),
      // Una redirección llevaría el token a otro destino.
      redirect: 'error',
    });
  } catch (err) {
    fail(`No se pudo conectar: ${(err as Error).message}`);
  }

  const text = await res.text();
  let output = text;
  try {
    output = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // Respuesta que no es JSON (una página de error intermedia): se muestra tal cual.
  }
  if (!res.ok) {
    console.error(output);
    process.exit(1);
  }
  console.log(output);
}

main().catch((err: unknown) => fail(`Error inesperado: ${(err as Error).message}`));
