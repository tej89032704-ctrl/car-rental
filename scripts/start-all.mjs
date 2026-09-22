// Dev supervisor: starts the NestJS API + all 4 Vite portals from one process.
// Usage: node scripts/start-all.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeBin = process.execPath;

const servers = [
  { name: 'api',      cwd: path.join(root, 'apps/api'),       args: ['dist/main.js'] },
  { name: 'renter',   cwd: path.join(root, 'apps/renter-web'), args: ['../../node_modules/vite/bin/vite.js', '--port', '5173', '--strictPort'] },
  { name: 'owner',    cwd: path.join(root, 'apps/owner-web'),  args: ['../../node_modules/vite/bin/vite.js', '--port', '5174', '--strictPort'] },
  { name: 'admin',    cwd: path.join(root, 'apps/admin-web'),  args: ['../../node_modules/vite/bin/vite.js', '--port', '5175', '--strictPort'] },
  { name: 'agent',    cwd: path.join(root, 'apps/agent-web'),  args: ['../../node_modules/vite/bin/vite.js', '--port', '5176', '--strictPort'] },
];

const children = new Map();

function start(name, cwd, args) {
  const child = spawn(nodeBin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  children.set(name, child);
  const tag = `[${name}]`;
  child.stdout.on('data', (d) => process.stdout.write(`${tag} ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`${tag} ${d}`));
  child.on('exit', (code, signal) => {
    console.log(`${tag} exited (code=${code}, signal=${signal})`);
    children.delete(name);
  });
  child.on('error', (err) => console.error(`${tag} failed to spawn: ${err.message}`));
}

for (const s of servers) start(s.name, s.cwd, s.args);

console.log('Supervisor started:', [...children.keys()].join(', '));

const shutdown = () => {
  console.log('Shutting down all servers...');
  for (const [name, child] of children) {
    try { child.kill(); } catch { /* ignore */ }
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Keep the supervisor alive while children run.
const keepAlive = setInterval(() => {
  if (children.size === 0) {
    clearInterval(keepAlive);
    console.log('All servers stopped. Exiting.');
    process.exit(0);
  }
}, 5000);