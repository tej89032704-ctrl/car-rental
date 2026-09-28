#!/usr/bin/env node
/**
 * `tsc` only ever emits .js — it will not copy `src/common/kyc/certs/*` into
 * `dist/`, and the runtime loader reads that directory. Run as the second half
 * of `npm run build` so a compiled build always has its trust anchors.
 *
 * The folder stays the single source of truth: dropping a new
 * `uidai_offline_publickey_<date>.cer` in it needs no code change.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'apps', 'api', 'src', 'common', 'kyc', 'certs');
const dst = path.join(root, 'apps', 'api', 'dist', 'common', 'kyc', 'certs');

if (!fs.existsSync(src)) {
  console.error(`[copy-kyc-certs] source missing: ${src}`);
  process.exit(1);
}

const files = fs.readdirSync(src).filter((f) => /\.(cer|pem|crt|md)$/i.test(f));
if (files.length === 0) {
  console.error(`[copy-kyc-certs] no certificates found in ${src}`);
  process.exit(1);
}

fs.mkdirSync(dst, { recursive: true });
for (const f of files) fs.copyFileSync(path.join(src, f), path.join(dst, f));

console.log(`[copy-kyc-certs] copied ${files.length} file(s) to ${dst}`);
