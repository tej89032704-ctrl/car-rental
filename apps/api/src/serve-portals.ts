import * as fs from 'fs';
import * as path from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Serves the five portal SPAs from the API process in production.
 *
 * Render's free tier gives one web service, so the API and every portal share a
 * single origin. The API's own routes are moved under `/api` (see main.ts), which
 * frees the root for one path prefix per portal:
 *
 *   /renter  /owner  /admin  /agent  /manager
 *
 * Each prefix serves that portal's `dist/` and falls back to its `index.html` for
 * client-side routes, exactly as the Vite dev server does. Renter and owner also
 * serve their standalone `login-split.html` at `<prefix>/login`, which is what the
 * dev-only `splitLogin()` Vite plugin does — that plugin never runs against a
 * built `dist/`, so the rewrite has to happen here instead.
 *
 * Nothing here runs in development: the portals are their own origins there
 * (localhost:5173-5177) and each has its own Vite server. main.ts only calls
 * this when NODE_ENV is production.
 */

/** Resolved relative to the compiled file: apps/api/dist -> repo root. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

interface Portal {
  /** Public path prefix, no trailing slash. */
  prefix: string;
  /** Build output directory, relative to the repo root. */
  dist: string;
  /** Whether this portal ships the premium split-login document. */
  splitLogin: boolean;
}

const PORTALS: Portal[] = [
  { prefix: '/renter', dist: 'apps/renter-web/dist', splitLogin: true },
  { prefix: '/owner', dist: 'apps/owner-web/dist', splitLogin: true },
  { prefix: '/admin', dist: 'apps/admin-web/dist', splitLogin: false },
  { prefix: '/agent', dist: 'apps/agent-web/dist', splitLogin: false },
  { prefix: '/manager', dist: 'apps/manager-web/dist', splitLogin: false },
];

export function servePortals(app: NestExpressApplication): void {
  let mounted = 0;

  for (const portal of PORTALS) {
    const dist = path.resolve(REPO_ROOT, portal.dist);
    if (!fs.existsSync(dist)) {
      // A partial build (only some portals) should still boot the API rather
      // than crash; the missing portal simply 404s until it is built.
      console.warn(`[serve] skipping ${portal.prefix}: ${portal.dist} not built`);
      continue;
    }

    app.use(portal.prefix, (req: any, res: any, next: () => void) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();

      // req.path is relative to the mount point: for /renter/cars/123 it is /cars/123.
      const rel = String(req.path || '/');
      const candidate = path.resolve(dist, '.' + rel);
      // Reject traversal that escaped the dist root.
      if (candidate !== dist && !candidate.startsWith(dist + path.sep)) return next();

      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return res.sendFile(candidate);
      }

      // SPA fallback. /login must resolve to the split document when the portal
      // has one, because a real navigation there never reaches React.
      let file = 'index.html';
      if (portal.splitLogin && /^\/login\/?$/.test(rel)) file = 'login-split.html';
      res.sendFile(path.join(dist, file));
    });

    mounted += 1;
  }

  // The entry point. Root is not a portal, so send visitors to the public one.
  // Reached through the Express instance rather than app.get(), which Nest
  // reserves for resolving providers from the DI container.
  app.getHttpAdapter().getInstance().get('/', (_req: any, res: any) => res.redirect('/renter'));

  // Anything unmatched is a stray root-level link from before the portals moved
  // under prefixes; land it in the renter SPA rather than a bare Nest 404. API
  // traffic (/api/...) is left for the router below.
  app.use((req: any, res: any, next: () => void) => {
    if (String(req.path || '').startsWith('/api')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const renter = path.resolve(REPO_ROOT, 'apps/renter-web/dist');
    if (fs.existsSync(path.join(renter, 'index.html'))) {
      return res.sendFile(path.join(renter, 'index.html'));
    }
    next();
  });

  console.log(`[serve] mounted ${mounted}/${PORTALS.length} portals`);
}
