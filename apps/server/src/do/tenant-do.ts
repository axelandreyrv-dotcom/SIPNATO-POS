import { DurableObject } from 'cloudflare:workers';
import { AsyncLocalStorage } from 'node:async_hooks';
import setupWasm from 'argon2id/lib/setup.js';
import simd from 'argon2id/dist/simd.wasm';
import noSimd from 'argon2id/dist/no-simd.wasm';
import type { Env } from '../env.js';

export class TenantDO extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (this.env.ENVIRONMENT === 'test' && url.pathname === '/internal/runtime-check') {
      return Response.json(await runtimeCheck(request));
    }
    return new Response('No implementado', { status: 501 });
  }
}

const tenantContext = new AsyncLocalStorage<string>();

async function runtimeCheck(request: Request) {
  const slug = request.headers.get('X-Dosuxsoft-Tenant') ?? '';
  return tenantContext.run(slug, async () => {
    // El `await` intermedio es lo que prueba que el contexto sobrevive a un cambio de turno.
    await new Promise((resolve) => setTimeout(resolve, 1));
    const als = tenantContext.getStore();
    const compute = (await setupWasm(
      (io: WebAssembly.Imports) =>
        WebAssembly.instantiate(simd, io).then((instance) => ({ instance })),
      (io: WebAssembly.Imports) =>
        WebAssembly.instantiate(noSimd, io).then((instance) => ({ instance })),
    )) as (p: {
      password: Uint8Array;
      salt: Uint8Array;
      parallelism: number;
      passes: number;
      memorySize: number;
      tagLength: number;
    }) => Uint8Array;
    const tag = compute({
      password: new TextEncoder().encode('x'),
      salt: new Uint8Array(16),
      parallelism: 1,
      passes: 1,
      memorySize: 8,
      tagLength: 32,
    });
    return { als, wasm: tag.length === 32 };
  });
}
