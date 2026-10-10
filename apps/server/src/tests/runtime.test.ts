import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('runtime de Workers', () => {
  it('AsyncLocalStorage conserva el contexto a través de await dentro de un DO', async () => {
    const res = await SELF.fetch('https://taller.dosuxsoft.com/internal/runtime-check');
    expect(await res.json()).toMatchObject({ als: 'taller' });
  });

  it('WebAssembly precompilado de argon2id carga', async () => {
    const res = await SELF.fetch('https://taller.dosuxsoft.com/internal/runtime-check');
    expect(await res.json()).toMatchObject({ wasm: true });
  });
});
