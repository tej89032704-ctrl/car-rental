/* Self-test for the KYC validators. Run: npx tsx scripts/kyc-selftest.ts */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { createRequire } from 'module';
import { SignedXml } from 'xml-crypto';
import { verhoeffValidate, verhoeffCheckDigit } from '../apps/api/src/common/kyc/verhoeff';
import { validateAadhaar, validateDrivingLicense, maskAadhaar, strengthLabel } from '../apps/api/src/common/kyc/doc-validate';
import { unzipOfflinePack, looksLikeZip, ZipError } from '../apps/api/src/common/kyc/zip';
import {
  verifyOfflineEkyc,
  parseReferenceId,
  parseDob,
  namesMatch,
  computeEkycHash,
} from '../apps/api/src/common/kyc/aadhaar-ekyc';
import { loadUidaiCerts } from '../apps/api/src/common/kyc/certs';

let pass = 0;
const fails: string[] = [];
function ok(label: string, cond: boolean, extra = '') {
  if (cond) pass++;
  else fails.push(`${label}${extra ? ` :: ${extra}` : ''}`);
}

// ---------------------------------------------------------------- cross-check
// The independent `verhoeff` package (Sergey Petushkov) shipped the same tables.
const refPath = path.join(os.tmpdir(), 'verhoeff-ref.js');
if (fs.existsSync(refPath)) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ref = createRequire(path.join(process.cwd(), 'noop.js'))(refPath);
  const names = Object.keys(ref);
  const validate = ref.validate ?? ref.verhoeffValidate ?? ref.check;
  if (typeof validate === 'function') {
    for (let i = 0; i < 5000; i++) {
      const body = String(10000000000 + Math.floor(Math.random() * 89999999999)).slice(0, 11);
      const full = body + verhoeffCheckDigit(body);
      const refSaysValid = ref.validate ? ref.validate(full) : validate(full);
      ok(`cross-check agrees ${full}`, refSaysValid === true, `ref=${refSaysValid}`);
      ok(`cross-check agrees (mine) ${full}`, verhoeffValidate(full));
      const tampered = full.slice(0, 11) + ((Number(full[11]) + 3) % 10);
      ok(`cross-check agrees on ${tampered}`, (ref.validate ? ref.validate(tampered) : validate(tampered)) === verhoeffValidate(tampered));
    }
    console.log(`cross-check vs reference impl (exports: ${names.join(', ')}) OK`);
  } else {
    console.log(`reference impl exports [${names.join(', ')}] — no validate() to compare against; skipped`);
  }
} else {
  console.log('reference impl not downloaded — cross-check skipped');
}

// ------------------------------------------------------------------ verhoeff
ok('check-digit round trip', Array.from({ length: 3000 }, () => {
  const body = String(10000000000 + Math.floor(Math.random() * 89999999999)).slice(0, 11);
  return verhoeffValidate(body + verhoeffCheckDigit(body));
}).every(Boolean));
ok('single-digit mutation detected', Array.from({ length: 500 }, () => {
  const body = String(10000000000 + Math.floor(Math.random() * 89999999999)).slice(0, 11);
  const full = body + verhoeffCheckDigit(body);
  const pos = Math.floor(Math.random() * 12);
  const d = full[pos];
  const sub = String((Number(d) + 1 + Math.floor(Math.random() * 9)) % 10);
  return !verhoeffValidate(full.slice(0, pos) + sub + full.slice(pos + 1));
}).every(Boolean));
ok('rejects non-digits', !verhoeffValidate('1234567890A'));

// ------------------------------------------------------------------ aadhaar
const mk = (body11: string) => body11 + verhoeffCheckDigit(body11);
ok('valid aadhaar accepted', validateAadhaar(mk('23456789012')).ok);
ok('spaced input accepted', validateAadhaar(mk('23456789012').replace(/(\d{4})(?=\d)/g, '$1 ')).ok);
ok('dashed input accepted', validateAadhaar(mk('23456789012').replace(/(\d{4})(?=\d)/g, '$1-')).ok);
ok('valid reports checksum_ok', validateAadhaar(mk('23456789012')).strength === 'checksum_ok');
ok('last4 correct', validateAadhaar(mk('23456789012')).last4 === mk('23456789012').slice(8));

const bad = mk('23456789012');
ok('bad checksum rejected', !validateAadhaar(bad.slice(0, 11) + ((Number(bad[11]) + 1) % 10)).ok);
ok('checksum error is specific', /checksum/.test(validateAadhaar(bad.slice(0, 11) + ((Number(bad[11]) + 1) % 10)).error ?? ''));
ok('11 digits rejected', !validateAadhaar('12345678901').ok);
ok('13 digits rejected', !validateAadhaar('1234567890123').ok);
ok('all zeros rejected', !validateAadhaar('000000000000').ok);
ok('empty rejected', !validateAadhaar('').ok);

const masked = validateAadhaar('XXXX XXXX 4321');
ok('masked accepted', masked.ok);
ok('masked strength', masked.strength === 'masked_only');
ok('masked stores last4 only', masked.masked === 'XXXX XXXX 4321' && !/\d{5,}/.test(masked.masked));
ok('masked 3 digits rejected', !validateAadhaar('XXXX XXXX 432').ok);
ok('maskAadhaar format', maskAadhaar('1234') === 'XXXX XXXX 1234');
ok('strengthLabel', strengthLabel('checksum_ok') === 'checksum verified');

// ------------------------------------------------------------ driving licence
const FUTURE = new Date(Date.now() + 900 * 86400000).toISOString().slice(0, 10);
const PAST = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);

// The regression this whole parser exists for: greedy RTO split reads year 1900.
const dl = validateDrivingLicense('KA0120190012345', FUTURE);
ok('KA0120190012345 accepted', dl.ok, dl.error);
ok('  parses issue year 2019 (not 1900)', dl.issueYear === 2019, `got ${dl.issueYear}`);
ok('  strict pattern', dl.pattern === 'strict');
ok('  state', dl.state === 'KA');
ok('  normalised', dl.number === 'KA0120190012345');

ok('spaced licence normalises', validateDrivingLicense('ka 01 2019 0012345', FUTURE).number === 'KA0120190012345');
ok('other state codes pass', validateDrivingLicense('MH1220200012345', FUTURE).ok);
ok('DL state passes', validateDrivingLicense('DL0120150012345', FUTURE).ok);
ok('legacy UA passes', validateDrivingLicense('UA0720180012345', FUTURE).ok);
ok('3-digit RTO year resolves', validateDrivingLicense('KA50120200012345', FUTURE).issueYear === 2020);

ok('unknown state rejected', !validateDrivingLicense('ZZ0120190012345', FUTURE).ok);
ok('  says which part failed', /state code/.test(validateDrivingLicense('ZZ0120190012345', FUTURE).error ?? ''));
ok('implausible past year rejected', !validateDrivingLicense('KA0119500012345', FUTURE).ok);
ok('  year error message', /Issue year 1950/.test(validateDrivingLicense('KA0119500012345', FUTURE).error ?? ''));
ok('implausible future year rejected', !validateDrivingLicense('KA0120990012345', FUTURE).ok);
ok('  future year error message', /Issue year 2099/.test(validateDrivingLicense('KA0120990012345', FUTURE).error ?? ''));
ok('too short rejected', !validateDrivingLicense('KA012019001', FUTURE).ok);
ok('too long rejected', !validateDrivingLicense('KA01201900123456789', FUTURE).ok);
ok('empty rejected', !validateDrivingLicense('', FUTURE).ok);

ok('expired rejected', !validateDrivingLicense('KA0120190012345', PAST).ok);
ok('  expiry message names the date', new RegExp(PAST).test(validateDrivingLicense('KA0120190012345', PAST).error ?? ''));
ok('missing expiry rejected', !validateDrivingLicense('KA0120190012345', '').ok);
ok('garbage date rejected', !validateDrivingLicense('KA0120190012345', '2026-02-30').ok);
ok('impossible future rejected', !validateDrivingLicense('KA0120190012345', '2099-01-01').ok);
ok('dd-mm-yyyy accepted', validateDrivingLicense('KA0120190012345', FUTURE.split('-').reverse().join('-')).ok);
ok('daysToExpiry positive', validateDrivingLicense('KA0120190012345', FUTURE).daysToExpiry > 0);

ok('legacy no-year format accepted as loose', (() => {
  const r = validateDrivingLicense('KA01000012345', FUTURE);
  return r.ok && r.pattern === 'loose' && r.issueYear === undefined;
})(), JSON.stringify(validateDrivingLicense('KA01000012345', FUTURE)));

// --------------------------------------------------------------- zip reader
// Real UIDAI-format fixture: a `zip -P` produced, deflate + ZipCrypto archive
// with Share Phrase `Share@1234`, published by the `aadhaar-offline-kyc` crate.
const zipPath = path.join(process.cwd(), 'scripts', 'fixtures', 'zipcrypto_offline_ekyc.zip');
const plainZipPath = path.join(process.cwd(), 'scripts', 'fixtures', 'plain.zip');
{
  const enc = fs.readFileSync(zipPath);
  ok('fixture recognised as zip', looksLikeZip(enc));
  const xml = unzipOfflinePack(enc, 'Share@1234').data.toString('utf8');
  ok('ZipCrypto pack decrypts', xml.includes('OfflinePaperlessKyc'), xml.slice(0, 120));
  ok('  payload is the expected test user', xml.includes('Test User'));

  for (const [label, phrase] of [['wrong phrase', 'Wrong@0000'], ['near miss', 'Share@1233'], ['empty', ''], ['too short', 'Sha']]) {
    let threw: unknown = null;
    try { unzipOfflinePack(enc, phrase); } catch (e) { threw = e; }
    ok(`${label} rejected`, threw !== null, `accepted ${JSON.stringify(phrase)}`);
    ok(`  ${label} is a ZipError`, threw instanceof ZipError, threw === null ? '' : String((threw as Error).message));
    const msg = threw === null ? '' : String((threw as Error).message);
    ok(`  ${label} message is user-safe`, !!msg && !/undefined|TypeError|at Object|node_modules/.test(msg), msg);
  }

  // No-password path: bsdtar-written zip, no encryption.
  const pr = unzipOfflinePack(fs.readFileSync(plainZipPath), '');
  ok('plain zip reads without a password', pr.data.toString('utf8').includes('OfflinePaperlessKyc'));
  ok('plain zip picks the xml entry', /\.xml$/i.test(pr.name), pr.name);
}

// ------------------------------------------------ offline e-KYC: cert store
{
  const certs = loadUidaiCerts();
  ok('UIDAI certs load', certs.length >= 5, `got ${certs.length}`);
  ok('  newest key first', certs[0]?.label === 'UIDAI key 2026', certs[0]?.label);
  ok('  every cert is an X.509 PEM', certs.every((c) => c.pem.includes('-----BEGIN CERTIFICATE-----')));
  ok('  every cert is labelled', certs.every((c) => /^UIDAI key \S+$/.test(c.label)));
  ok('  labels unique', new Set(certs.map((c) => c.label)).size === certs.length);
}

// ------------------------------------- offline e-KYC: referenceId + dates
{
  // UIDAI's own published sample reference number.
  const s = parseReferenceId('925020190122165455195');
  ok('UIDAI sample referenceId parses', s !== null);
  ok('  last 4 come from the reference', s?.last4 === '9250', s?.last4);
  ok('  timestamp comes from the reference',
    s?.issuedAt.toISOString() === '2019-01-22T16:54:55.000Z', s?.issuedAt.toISOString());

  ok('short referenceId rejected', parseReferenceId('1234') === null);
  ok('long referenceId rejected', parseReferenceId('1234567890123456789012') === null);
  ok('non-digit referenceId rejected', parseReferenceId('92502019012216545519a') === null);
  ok('month 13 rejected', parseReferenceId('925020191301165455195') === null);
  ok('30 February rejected', parseReferenceId('925020190230165455195') === null);
  ok('hour 25 rejected', parseReferenceId('925020190101255455195') === null);
  ok('29 February 2019 rejected (not a leap year)', parseReferenceId('925020190229165455195') === null);
  ok('29 February 2020 accepted (leap year)', parseReferenceId('925020200229165455195') !== null);

  ok('dob DD-MM-YYYY', parseDob('02-11-1995')?.iso === '1995-11-02', JSON.stringify(parseDob('02-11-1995')));
  ok('dob DD/MM/YYYY', parseDob('02/11/1995')?.iso === '1995-11-02');
  ok('dob DDMMYYYY', parseDob('02111995')?.iso === '1995-11-02');
  ok('dob already ISO', parseDob('1995-11-02')?.iso === '1995-11-02');
  ok('year of birth only', parseDob('1995')?.iso === null && parseDob('1995')?.year === 1995);
  ok('30 February rejected', parseDob('2026-02-30') === null);
  ok('garbage rejected', parseDob('not a date') === null);
  ok('empty rejected', parseDob('') === null);
  ok('null rejected', parseDob(null) === null);

  ok('names exact match', namesMatch('Rahul Sharma', 'rahul sharma'));
  ok('names ignore punctuation', namesMatch('Rahul Sharma.', 'Rahul Sharma'));
  ok('names allow an extra middle token', namesMatch('Rahul K Sharma', 'Rahul Sharma'));
  ok('different surnames do not match', !namesMatch('Rahul Sharma', 'Rahul Kumar'));
  ok('empty name never matches', !namesMatch('', 'Rahul'));

  // Both worked examples published by UIDAI.
  const sha = (v: string) => crypto.createHash('sha256').update(v, 'utf8').digest('hex');
  ok('UIDAI worked example (n=2)',
    computeEkycHash('1234567890', 'Lock@487', 2) === sha(sha('1234567890Lock@487')));
  ok('UIDAI FAQ example (n=4)',
    computeEkycHash('9800000002', 'Abc@123', 4) === sha(sha(sha(sha('9800000002Abc@123')))));
  ok('last digit 0 hashes exactly once', computeEkycHash('x', 'y', 0) === sha('xy'));
  ok('last digit 1 hashes exactly once', computeEkycHash('x', 'y', 1) === sha('xy'));
}

// -------------------------- offline e-KYC: signature + end-to-end verdicts
{
  const CERT_DIR = path.join(process.cwd(), 'apps', 'api', 'src', 'common', 'kyc', 'certs');
  const SHARE = 'Share@1234';
  const LAST4 = '3632'; // ends in 2 -> the mobile hash is taken twice
  const MOBILE = '1234567890';
  const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const trust = [{ label: 'ephemeral test key', pem: pubPem }];

  const referenceId = (last4: string, d: Date) =>
    last4 +
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}` +
    '123';

  interface BuildOpts {
    name?: string;
    dob?: string;
    refId?: string;
    photo?: boolean;
    poa?: boolean;
  }

  const buildXml = (o: BuildOpts = {}) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>` +
    `<OfflinePaperlessKyc referenceId="${o.refId ?? referenceId(LAST4, new Date(Date.now() - 10 * 86400000))}">` +
    `<UidData>` +
    `<Poi dob="${o.dob ?? '02-11-1995'}" gender="male" name="${o.name ?? 'Madhu N'}" m="${computeEkycHash(MOBILE, SHARE, Number(LAST4.slice(-1)))}"/>` +
    (o.poa === false ? '' :
      `<Poa country="India" dist="Kozhikode" house="123 Main" loc="Malaparamba" pc="673009" po="Malaparamba" state="Kerala" street="Main" subdist="005420" vtc="Malaparamba"/>`) +
    (o.photo === false ? '' : '<Pht>/9j/4AAQSkZJRgABAgAAAQABAAD</Pht>') +
    `</UidData></OfflinePaperlessKyc>`;

  /** `uidai` reproduces the exact reference shape UIDAI emits (`URI=""`). */
  const signXml = (xml: string, mode: 'uidai' | 'xpath') => {
    const s = new SignedXml();
    s.privateKey = privPem;
    s.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
    s.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
    const ref: Record<string, unknown> = {
      xpath: "//*[local-name(.)='OfflinePaperlessKyc']",
      transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    };
    if (mode === 'uidai') {
      ref.uri = '';
      ref.isEmptyUri = true;
    }
    s.addReference(ref as never);
    s.computeSignature(xml);
    return s.getSignedXml();
  };

  const run = (file: Buffer, opts: Partial<Parameters<typeof verifyOfflineEkyc>[0]> = {}) =>
    verifyOfflineEkyc({ file, shareCode: SHARE, ...opts });

  const base = buildXml();
  const uidaiSigned = signXml(base, 'uidai');
  const xpathSigned = signXml(base, 'xpath');
  ok('UIDAI reference shape is URI=""', /URI=""/.test(uidaiSigned), uidaiSigned.match(/<Reference[^>]*>/)?.[0]);
  ok('alternate reference shape is URI="#_0"', /URI="#_0"/.test(xpathSigned));

  // --- both reference shapes verify end to end -----------------------------
  for (const [label, doc] of [['URI=""', uidaiSigned], ['URI="#_0"', xpathSigned]] as const) {
    const r = run(Buffer.from(doc, 'utf8'), {
      trust, mobile: MOBILE, expectedLast4: LAST4, expectedName: 'madhu n', expectedDob: '1995-11-02',
    });
    ok(`signed pack verifies (${label})`, r.status === 'pass' && r.code === 'ok', `${r.status}/${r.code} ${r.detail}`);
    ok(`  last 4 cross-check (${label})`, r.crossCheck.last4 === 'match', r.crossCheck.last4);
    ok(`  dob cross-check (${label})`, r.crossCheck.dob === 'match', r.crossCheck.dob);
    ok(`  name cross-check (${label})`, r.crossCheck.name === 'match', r.crossCheck.name);
    ok(`  mobile hash cross-check (${label})`, r.crossCheck.mobile === 'match', r.crossCheck.mobile);
    if (label !== 'URI=""') continue;
    ok('  returns name', r.data?.name === 'Madhu N', r.data?.name);
    ok('  returns ISO dob', r.data?.dob === '1995-11-02', r.data?.dob);
    ok('  normalises gender', r.data?.gender === 'M', r.data?.gender);
    ok('  returns last 4', r.data?.last4 === LAST4, r.data?.last4);
    ok('  returns photo base64', (r.data?.photo ?? '').length > 0);
    ok('  returns 10 address fields', Object.keys(r.data?.address ?? {}).length === 10,
      String(Object.keys(r.data?.address ?? {}).length));
    ok('  reports the verifying key', r.data?.certLabel === 'ephemeral test key', r.data?.certLabel);
    ok('  reports pack age', (r.data?.ageDays ?? -1) >= 9 && (r.data?.ageDays ?? 99) <= 11,
      String(r.data?.ageDays));
    ok('  no warnings on a clean pack', r.warnings.length === 0, r.warnings.join(' | '));
  }

  // --- signature must actually gate the result ----------------------------
  ok('wrong trust anchor rejected',
    (() => { const r = run(Buffer.from(uidaiSigned), { trust: [{ label: 'uidai', pem: loadUidaiCerts()[0].pem }] });
      return r.status === 'fail' && r.code === 'signature_invalid'; })());
  ok('tampered payload rejected',
    (() => { const r = run(Buffer.from(uidaiSigned.replace('Madhu N', 'Evil Person'), 'utf8'), { trust });
      return r.status === 'fail' && r.code === 'signature_invalid'; })());
  ok('unsigned document rejected',
    (() => { const r = run(Buffer.from(base, 'utf8'), { trust });
      return r.status === 'fail' && r.code === 'no_signature'; })());

  // The document's own <KeyInfo> must never be used as the trust anchor, or
  // anyone could sign a pack with their own key. Here the keyInfo names a real
  // UIDAI certificate while the document was signed by `pubPem` — verification
  // must still succeed against `trust`, which only happens if KeyInfo is ignored.
  const uidaiDer = new crypto.X509Certificate(
    fs.readFileSync(path.join(CERT_DIR, 'uidai_offline_publickey_2026.cer')),
  ).raw.toString('base64');
  const withKeyInfo = uidaiSigned.replace('</Signature>',
    `<KeyInfo><X509Data><X509Certificate>${uidaiDer}</X509Certificate></X509Data></KeyInfo></Signature>`);
  ok('KeyInfo really was injected', withKeyInfo.includes('<KeyInfo>'));
  ok('document-supplied KeyInfo is ignored (trust anchor pinned)',
    (() => { const r = run(Buffer.from(withKeyInfo, 'utf8'), { trust });
      return r.status === 'pass' && r.code === 'ok'; })(),
    run(Buffer.from(withKeyInfo, 'utf8'), { trust }).code);

  // --- cross-check verdicts ----------------------------------------------
  ok('last-4 mismatch is fatal',
    (() => { const r = run(Buffer.from(uidaiSigned), { trust, expectedLast4: '9999' });
      return r.status === 'fail' && r.code === 'last4_mismatch' && r.crossCheck.last4 === 'mismatch'; })());
  ok('dob mismatch is fatal',
    (() => { const r = run(Buffer.from(uidaiSigned), { trust, expectedDob: '1990-01-01' });
      return r.status === 'fail' && r.code === 'dob_mismatch' && r.crossCheck.dob === 'mismatch'; })());
  ok('name mismatch goes to human review, not rejection',
    (() => { const r = run(Buffer.from(uidaiSigned), { trust, expectedName: 'Zed Compact' });
      return r.status === 'review' && r.code === 'ok' && r.crossCheck.name === 'mismatch'
        && r.warnings.some((w) => w.includes('Madhu N')); })());
  ok('mobile mismatch goes to human review',
    (() => { const r = run(Buffer.from(uidaiSigned), { trust, mobile: '9111111111' });
      return r.status === 'review' && r.crossCheck.mobile === 'mismatch'; })());

  // --- structural / reference failures ------------------------------------
  const signedWith = (o: BuildOpts) => Buffer.from(signXml(buildXml(o), 'uidai'), 'utf8');
  const expectCode = (file: Buffer, code: string, opts: Partial<Parameters<typeof verifyOfflineEkyc>[0]> = {}) => {
    const r = run(file, { trust, ...opts });
    return r.code === code;
  };
  ok('unrecognised file rejected as bad_file',
    expectCode(Buffer.from('this is not a file at all', 'utf8'), 'bad_file'));
  ok('foreign XML rejected as not_ekyc',
    expectCode(Buffer.from('<?xml version="1.0"?><Invoice><Line/></Invoice>', 'utf8'), 'not_ekyc'));
  ok('malformed referenceId rejected', expectCode(signedWith({ refId: '1234' }), 'bad_reference'));
  ok('pack dated in the future rejected',
    expectCode(signedWith({ refId: referenceId(LAST4, new Date(Date.now() + 5 * 86400000)) }), 'future_pack'));
  ok('legacy s="…" document rejected', expectCode(
    Buffer.from(`<?xml version="1.0"?><OfflinePaperlessKyc referenceId="${referenceId(LAST4, new Date())}" s="AAAA">` +
      `<UidData><Poi name="X"/></UidData></OfflinePaperlessKyc>`, 'utf8'), 'legacy_format'));

  // --- soft findings -------------------------------------------------------
  ok('400-day-old pack goes to review with a warning',
    (() => { const r = run(signedWith({ refId: referenceId(LAST4, new Date(Date.now() - 400 * 86400000)) }), { trust });
      return r.status === 'review' && r.code === 'ok' && r.warnings.some((w) => /400 days/.test(w)); })());
  ok('missing photo and address go to review',
    (() => { const r = run(signedWith({ photo: false, poa: false }), { trust });
      return r.status === 'review' && r.warnings.length === 2; })());
  ok('year-of-birth-only pack still matches a full dob',
    (() => { const r = run(signedWith({ dob: '1995' }), { trust, expectedDob: '1995-06-15' });
      return r.status === 'pass' && r.crossCheck.dob === 'match'; })());

  // --- composed with the real encrypted fixture ---------------------------
  const fixture = fs.readFileSync(path.join(process.cwd(), 'scripts', 'fixtures', 'zipcrypto_offline_ekyc.zip'));
  ok('fixture + wrong Share Phrase -> bad_share_phrase', expectCode(fixture, 'bad_share_phrase', { shareCode: 'Wrong@0000', trust }));
  ok('fixture + no Share Phrase -> bad_share_phrase', expectCode(fixture, 'bad_share_phrase', { shareCode: '', trust }));
  // The fixture's XML is a stripped sample with no <Signature>, so once the ZIP
  // is opened the pipeline must reach the signature check and stop there.
  ok('fixture + right Share Phrase reaches the signature check',
    expectCode(fixture, 'no_signature', { shareCode: SHARE, trust }));
  ok('plain (unencrypted) zip reaches the signature check',
    expectCode(fs.readFileSync(path.join(process.cwd(), 'scripts', 'fixtures', 'plain.zip')), 'no_signature', { trust }));
}

// ------------------------------------------------------------------- report
console.log(`\n${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log('  FAIL ' + f);
if (fails.length) process.exit(1);
