import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Production serves this portal from one origin at its own path prefix
  // (/admin). The build is given that prefix via PORTAL_BASE; local dev leaves
  // it unset and serves from the origin root exactly as before.
  base: process.env.PORTAL_BASE || '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
