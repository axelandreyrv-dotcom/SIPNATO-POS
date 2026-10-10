import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Wrangler leería apps/server/.env como secretos; ahí vive el token real del BCCR y
// los tests no deben poder usarlo.
process.env['CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV'] = 'false';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // Token falso: los tests simulan el API del BCCR, nunca lo llaman de verdad.
        bindings: { ENVIRONMENT: 'test', BCCR_API_TOKEN: 'token-de-prueba' },
        // el dist del frontend es salida de build (no versionada): los tests usan un fixture mínimo.
        assets: {
          directory: fileURLToPath(new URL('./src/tests/fixtures/assets', import.meta.url)),
          binding: 'ASSETS',
        },
      },
    }),
  ],
  test: {
    include: ['src/tests/**/*.test.ts'],
  },
});
