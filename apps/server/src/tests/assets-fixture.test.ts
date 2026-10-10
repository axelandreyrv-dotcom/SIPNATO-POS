import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';

it('el binding ASSETS de los tests sirve el fixture versionado', async () => {
  const res = await env.ASSETS.fetch('https://taller.dosuxsoft.com/index.html');
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('fixture');
});
