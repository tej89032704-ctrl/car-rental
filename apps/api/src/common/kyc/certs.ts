import * as fs from 'fs';
import * as path from 'path';
import { X509Certificate } from 'crypto';

/**
 * One of UIDAI's **public** signing certificates for the Aadhaar Paperless
 * Offline e-KYC XML. Nothing here is secret and none of it can be used to
 * forge a signature — only UIDAI's private key can do that.
 *
 * See `certs/README.md` for where each file came from and how to rotate.
 */
export interface UidaiCert {
  /** Short human label, e.g. `UIDAI key 2026`. */
  label: string;
  /** PEM-encoded certificate — exactly what xml-crypto's `publicCert` expects. */
  pem: string;
}

/**
 * Tried in order so the first (and usually only) match is reported against the
 * most recent key. Anything else found in the folder is appended alphabetically.
 */
const PREFERRED: readonly string[] = [
  'uidai_offline_publickey_2026.cer',
  'uidai_offline_publickey_17022026.cer',
  'uidai_offline_publickey_26022021.cer',
  'uidai_offline_publickey_2023.cer',
  'uidai_offline_publickey_pre2019.cer',
];

/**
 * Where to look for `certs/`.
 *
 * `tsc` never copies non-TS assets, so the build has a matching copy step
 * (`copy-kyc-certs.mjs`) that lands them next to the compiled module in
 * `dist/`. The remaining candidates cover running straight from `src` and
 * running the self-test with the repo root as cwd.
 */
function candidateDirs(): string[] {
  return [
    path.join(__dirname, 'certs'),
    path.join(process.cwd(), 'apps', 'api', 'src', 'common', 'kyc', 'certs'),
    path.join(process.cwd(), 'src', 'common', 'kyc', 'certs'),
    path.join(process.cwd(), 'dist', 'common', 'kyc', 'certs'),
  ];
}

function certDir(): string | null {
  for (const dir of candidateDirs()) {
    try {
      if (fs.readdirSync(dir).some((f) => f.toLowerCase().endsWith('.cer'))) return dir;
    } catch {
      // not this one — try the next candidate
    }
  }
  return null;
}

/**
 * Normalise whatever is in the file to PEM.
 *
 * The five files are a mix: some are raw DER, some are already PEM, and a bare
 * `BEGIN PUBLIC KEY` is tolerated as a fallback. Passing DER bytes straight to
 * `X509Certificate` handles the certificate cases without decoding first —
 * decoding binary DER as UTF-8 would corrupt it.
 */
function toPem(buf: Buffer): string | null {
  try {
    // `raw` is always DER, whether the file was DER or PEM — and unlike
    // `x509.toString('pem')` it does not depend on a type declaration
    // @types/node does not provide.
    const der = new X509Certificate(buf).raw;
    const b64 = der.toString('base64').replace(/(.{64})/g, '$1\n').replace(/\n$/, '');
    return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
  } catch {
    // not a certificate — maybe a bare public key
  }
  const text = buf.toString('latin1'); // PEM is ASCII, so this round-trips
  if (text.includes('BEGIN PUBLIC KEY')) return `${text.trim()}\n`;
  return null;
}

function labelFor(file: string): string {
  const base = file.replace(/\.cer$/i, '');
  const trimmed = base.replace(/^uidai_offline_publickey_?/i, '');
  return trimmed && trimmed !== base ? `UIDAI key ${trimmed}` : base;
}

let cached: UidaiCert[] | null = null;
let warnedEmpty = false;

/**
 * All trusted UIDAI offline e-KYC certificates, newest first.
 *
 * Certificates are matched by **public key, not validity window**: packs signed
 * with an old key stay legitimate for years, so expired certs stay in the list.
 * An empty result means the assets are missing and signature checks will fail —
 * that is a packaging bug, not a bad upload, so it is warned about once.
 */
export function loadUidaiCerts(): UidaiCert[] {
  if (cached) return cached;

  const out: UidaiCert[] = [];
  const dir = certDir();
  if (dir) {
    const present = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.cer'));
    const known = PREFERRED.filter((p) => present.includes(p));
    const extra = present.filter((f) => !PREFERRED.includes(f)).sort();
    for (const file of [...known, ...extra]) {
      const pem = toPem(fs.readFileSync(path.join(dir, file)));
      if (pem) out.push({ label: labelFor(file), pem });
    }
  }

  if (out.length === 0 && !warnedEmpty) {
    warnedEmpty = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[kyc] no UIDAI offline e-KYC certificates found — signature verification will fail. ' +
        'Expected them under src/common/kyc/certs (copied to dist by the build).',
    );
  }

  cached = out;
  return out;
}

/** Test hook: forget the memoised cert list so a directory change is picked up. */
export function __resetCertCache(): void {
  cached = null;
  warnedEmpty = false;
}
