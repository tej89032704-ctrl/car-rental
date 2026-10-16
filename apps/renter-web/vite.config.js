import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The renter portal's sign-in screen is `public/login-split.html`, a standalone
 * document: its own Cormorant/Inter typography, its own canvas scenes, and its
 * own fetch to /api/auth/login that writes the access_token / refresh_token /
 * user keys packages/shared/src/api.js reads back. It is not a React page and
 * was only reachable at /login-split.html, while /login showed the older React
 * auth form.
 *
 * This plugin makes /login *be* that document, so the URL people type, link to
 * and bookmark is the one that renders it. The rewrite happens before Vite's
 * own middleware — the browser URL never changes, the file is simply what gets
 * served for that path.
 *
 * Only document requests are rewritten. `/login` is also not a real file, so
 * anything asking for it as something other than a page (an asset fetch, a
 * script) still falls through to Vite's normal handling.
 *
 * Production note: the built site is a static `dist/`, and no hosting config
 * lives in this repo, so this plugin covers `vite dev` and `vite preview` only.
 * A static host must send /login to /login-split.html for the same URL to work
 * there. src/pages/Login.jsx detects that case and falls back to the file
 * itself rather than looping, so a deployment that misses the rewrite still
 * shows this page (just at /login-split.html).
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
  // In production the API serves every portal from ONE origin under its own path
  // prefix (/renter, /owner, ...). The build is given that prefix via
  // PORTAL_BASE; local dev leaves it unset and keeps serving from the origin
  // root exactly as before.
  base: process.env.PORTAL_BASE || '/',
  plugins: [react(), splitLogin()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
