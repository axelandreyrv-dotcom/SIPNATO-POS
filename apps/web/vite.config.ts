import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

// El Worker identifica el negocio por el subdominio (taller.localhost:5174). El proxy conserva
// el Host original (changeOrigin: false; la forma corta '/api': 'http://...' lo reescribiría a
// localhost:8787) y xfwd añade X-Forwarded-Host, que el Worker de desarrollo
// (ENVIRONMENT=development) usa cuando wrangler reescribe el Host.
const apiProxy: ProxyOptions = { target: 'http://localhost:8787', changeOrigin: false, xfwd: true };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['framer-motion'],
  },
  server: {
    port: parseInt(process.env['PORT'] ?? '5174'),
    proxy: {
      '/api': apiProxy,
      '/auth': apiProxy,
      '/health': apiProxy,
      '/platform': apiProxy,
      '/internal': apiProxy,
    },
  },
});
