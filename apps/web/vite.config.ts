import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

// El servidor identifica el negocio por el subdominio (taller.localhost:5174), así que el
// proxy debe conservar el Host original, igual que Caddy en producción. La forma corta
// '/api': 'http://...' activa changeOrigin y lo reescribiría a localhost:3000.
const apiProxy: ProxyOptions = { target: 'http://localhost:3000', changeOrigin: false };

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
    },
  },
});
