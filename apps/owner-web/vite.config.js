import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The owner portal's sign-in screen is `public/login-split.html`, the split
 * document that carries both halves of the platform's login (renter on the
 * ivory side, owner on the dark side) and hands a session to whichever portal
 * owns the role that signed in.
 *
 * Same arrangement as the customer portal: /login *is* that document, so the
 * URL people type, link to and bookmark renders the real page instead of the
 * older React auth card. The rewrite runs before Vite's own middleware, so the
 * browser URL never changes.
 *
 * Only document requests are rewritten; anything asking for /login as an asset
 * still falls through to normal handling.
 *
 * Production note: the built site is a static `dist/` and no hosting config
 * lives in this repo, so this covers `vite dev` and `vite preview` only. A
 * static host must send /login to /login-split.html. src/pages/Login.jsx
 * detects that case and falls back to the file rather than looping.
 */
function splitLogin() {
  const isLoginDocument = (req) =>
    (req.method === 'GET' || req.method === 'HEAD') &&
    String(req.headers.accept || '').includes('text/html') &&
    /^\/login(?:\/)?(?:\?|$)/.test(req.url || '');

  const rewrite = (req) => {
    if (isLoginDocument(req)) req.url = req.url.replace(/^\/login(?:\/)?/, '/login-split.html');
  };

  return {
    name: 'serve-split-login-at-login',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => { rewrite(req); next(); });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => { rewrite(req); next(); });
    },
  };
}

export default defineConfig({
  plugins: [react(), splitLogin()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
