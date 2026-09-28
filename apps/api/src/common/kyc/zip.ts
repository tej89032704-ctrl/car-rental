import * as zlib from 'zlib';
import * as crypto from 'crypto';

/**
 * Minimal ZIP reader for Aadhaar Paperless Offline e-KYC packs: one small
 * archive, one entry, optionally password-protected by the 4-digit Share Phrase.
 *
 * Hand-rolled rather than pulled from npm because the entire feature rests on
 * knowing exactly what was decrypted — every path below ends in a CRC-32 (or an
 * AES authentication code) check, so a wrong Share Phrase can never be mistaken
 * for a valid one.
 *
 * Handles:
 *  - ZipCrypto (PKWARE) — what UIDAI packs in the wild actually use
 *  - AES-256 (AE-1/AE-2, method 99) — for packs UIDAI has not shipped yet
 *  - stored (0) and deflate (8) entries, encrypted or not
 *  - central-directory sizes when the local header defers them (bit 3)
 *
 * Deliberately unsupported: Zip64, multi-disk. Offline e-KYC packs are ~100 KB
 * with one entry, so hitting either means the file is not an e-KYC pack.
 */

const LOC_SIG = 0x04034b50;
const CEN_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const EOCD64_LOC_SIG = 0x07064b50;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const METHOD_AES = 99;

const FLAG_ENCRYPTED = 0x0001;
const FLAG_DATA_DESCRIPTOR = 0x0008;

/** Guards against a crafted archive inflating into gigabytes. */
const MAX_OUTPUT = 32 * 1024 * 1024;
/** Offline packs are ~100 KB; anything this big is not one. */
const MAX_ARCHIVE = 16 * 1024 * 1024;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

// ------------------------------------------------------------------------ crc32

let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

/** Raw one-byte CRC step — also the update used by the ZipCrypto key schedule. */
function crc32Step(crc: number, byte: number): number {
  return (crcTable()[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;
}

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crc32Step(c, buf[i]);
  return (c ^ 0xffffffff) >>> 0;
}

// ------------------------------------------------------------------ zip crypto

/**
 * PKWARE legacy stream cipher key schedule (APPNOTE 6.2.2).
 *
 * Initial constants are `0x12345678, 0x23456789, 0x34567890` — confirmed
 * byte-for-byte against CPython's `zipfile._ZipDecrypter` and against a real
 * `zip -P` UIDAI-format fixture (encrypted entry CRC-32 round-trips).
 * (`0xcbf43926` is the CRC of "123456789" and is *not* one of these; using it
 * as key1 silently produces a keystream that matches nothing.)
 */
class ZipCryptoKeys {
  private k0 = 305419896;
  private k1 = 591751049;
  private k2 = 878082192;

  constructor(password: string) {
    for (const b of Buffer.from(password, 'utf8')) this.update(b);
  }

  private update(byte: number): void {
    this.k0 = crc32Step(this.k0, byte);
    // 32-bit multiply: the naive product overflows double precision, so this
    // must go through Math.imul.
    this.k1 = (Math.imul((this.k1 + (this.k0 & 0xff)) >>> 0, 134775813) + 1) >>> 0;
    this.k2 = crc32Step(this.k2, (this.k1 >>> 24) & 0xff);
  }

  /** Next plaintext byte from the keystream. */
  private next(): number {
    const t = (this.k2 | 2) & 0xffff;
    // Equivalent to ((t * (t ^ 1)) >> 8) & 0xff but without routing a value
    // above 2^31 through JS ToInt32.
    return Math.floor((t * (t ^ 1)) / 256) & 0xff;
  }

  decrypt(buf: Buffer): Buffer {
    const out = Buffer.allocUnsafe(buf.length);
    for (let i = 0; i < buf.length; i++) {
      const plain = buf[i] ^ this.next();
      out[i] = plain;
      this.update(plain);
    }
    return out;
  }
}

// ------------------------------------------------------------------------- aes

/** AE-1/AE-2 (APPNOTE 4.x). Returns the plaintext, or throws. */
function decryptAes(entryData: Buffer, password: string, strength: number): Buffer {
  const keyLen = strength === 1 ? 16 : strength === 2 ? 24 : 32;
  const saltLen = strength === 1 ? 8 : strength === 2 ? 12 : 16;
  if (entryData.length < saltLen + 2 + 10) throw new ZipError('encrypted entry is truncated');

  const salt = entryData.subarray(0, saltLen);
  const pwdVerify = entryData.subarray(saltLen, saltLen + 2);
  const tail = entryData.subarray(saltLen + 2);

  // dkLen = enc key + hmac key + 2 verify bytes; 1000 iterations of PBKDF2-HMAC-SHA1.
  const dk = crypto.pbkdf2Sync(password, salt, 1000, keyLen * 2 + 2, 'sha1');
  const encKey = dk.subarray(0, keyLen);
  const authKey = dk.subarray(keyLen, keyLen * 2);
  if (!dk.subarray(keyLen * 2).equals(pwdVerify)) throw new ZipError('wrong Share Phrase');

  const ciphertext = tail.subarray(0, Math.max(0, tail.length - 10));
  const authCode = tail.subarray(tail.length - 10);

  // The auth code is HMAC-SHA1 over the *encrypted* bytes, truncated to 10.
  const expected = crypto.createHmac('sha1', authKey).update(ciphertext).digest().subarray(0, 10);
  if (!expected.equals(authCode)) throw new ZipError('encrypted entry failed its authentication code');

  // Counter starts at 1 and runs big-endian across the whole 128-bit block.
  const iv = Buffer.alloc(16);
  iv[15] = 1;
  const decipher = crypto.createCipheriv('aes-256-ctr', Buffer.from(encKey), iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// --------------------------------------------------------------------- reading

interface Entry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  modTime: number;
  aes?: { strength: number; actualMethod: number };
}

function findEocd(buf: Buffer): { offset: number; cdOffset: number; cdSize: number; count: number } {
  if (buf.length < 22) throw new ZipError('file is too small to be a ZIP');
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) !== EOCD_SIG) continue;
    const commentLen = buf.readUInt16LE(i + 20);
    if (i + 22 + commentLen > buf.length) continue;
    const cdSize = buf.readUInt32LE(i + 12);
    const cdOffset = buf.readUInt32LE(i + 16);
    const count = buf.readUInt16LE(i + 10);
    if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
      throw new ZipError('Zip64 archives are not supported — this is not an Aadhaar e-KYC pack');
    }
    return { offset: i, cdOffset, cdSize, count };
  }
  throw new ZipError('no ZIP end-of-central-directory record found');
}

function readExtraField(extra: Buffer, id: number): Buffer | null {
  let p = 0;
  while (p + 4 <= extra.length) {
    const hid = extra.readUInt16LE(p);
    const size = extra.readUInt16LE(p + 2);
    const start = p + 4;
    if (start + size > extra.length) return null;
    if (hid === id) return extra.subarray(start, start + size);
    p = start + size;
  }
  return null;
}

function readCentralDirectory(buf: Buffer, eocd: ReturnType<typeof findEocd>): Entry[] {
  const entries: Entry[] = [];
  let p = eocd.cdOffset;
  for (let i = 0; i < eocd.count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) {
      throw new ZipError('central directory is malformed');
    }
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const modTime = buf.readUInt16LE(p + 12);
    const crc = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const extra = buf.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);

    let aes: Entry['aes'];
    if (method === METHOD_AES) {
      const f = readExtraField(extra, 0x9901);
      if (!f || f.length < 7) throw new ZipError('AES entry is missing its encryption header');
      aes = { strength: f[4], actualMethod: f.readUInt16LE(5) };
    }

    if (compressedSize === 0xffffffff) {
      throw new ZipError('Zip64 entries are not supported — this is not an Aadhaar e-KYC pack');
    }
    entries.push({ name, flags, method, crc, compressedSize, uncompressedSize, localOffset, modTime, aes });
    p += 46 + nameLen + extraLen + commentLen;
    if (p > eocd.cdOffset + eocd.cdSize) break;
  }
  if (entries.length === 0) throw new ZipError('archive contains no entries');
  return entries;
}

function localDataOffset(buf: Buffer, entry: Entry): number {
  if (entry.localOffset + 30 > buf.length || buf.readUInt32LE(entry.localOffset) !== LOC_SIG) {
    throw new ZipError('local file header is malformed');
  }
  const nameLen = buf.readUInt16LE(entry.localOffset + 26);
  const extraLen = buf.readUInt16LE(entry.localOffset + 28);
  const dataStart = entry.localOffset + 30 + nameLen + extraLen;
  if (dataStart + entry.compressedSize > buf.length) throw new ZipError('entry data runs past the end of the file');
  return dataStart;
}

function inflate(raw: Buffer, expected: number): Buffer {
  if (raw.length > MAX_OUTPUT) throw new ZipError('entry is too large');
  try {
    const out = zlib.inflateRawSync(raw, { maxOutputLength: MAX_OUTPUT });
    if (expected && out.length !== expected) throw new ZipError('decompressed size does not match the directory');
    return out;
  } catch (e) {
    if (e instanceof ZipError) throw e;
    // Deflate over a wrong keystream is indistinguishable from a bad password.
    throw new ZipError('could not decompress — wrong Share Phrase, or not an e-KYC archive');
  }
}

function chooseEntry(entries: Entry[]): Entry {
  const xml = entries.find((e) => !e.name.endsWith('/') && /\.xml$/i.test(e.name));
  if (xml) return xml;
  const first = entries.find((e) => !e.name.endsWith('/'));
  if (!first) throw new ZipError('archive contains no files');
  return first;
}

/**
 * Read the single payload out of an offline e-KYC archive.
 *
 * @param zip      raw file bytes
 * @param password the 4-digit Share Phrase; ignored for unencrypted archives
 * @throws {ZipError} with a message safe to show a user
 */
export function unzipOfflinePack(zip: Buffer, password: string): { name: string; data: Buffer } {
  if (zip.length > MAX_ARCHIVE) throw new ZipError('archive is too large to be an Aadhaar e-KYC pack');
  if (zip.readUInt32LE(0) === EOCD64_LOC_SIG) {
    throw new ZipError('this looks like a Zip64 archive, which is not an e-KYC pack');
  }

  const eocd = findEocd(zip);
  const entries = readCentralDirectory(zip, eocd);
  const entry = chooseEntry(entries);
  const start = localDataOffset(zip, entry);
  let data = zip.subarray(start, start + entry.compressedSize);

  if (!(entry.flags & FLAG_ENCRYPTED)) {
    // No password involved — nothing to prove beyond the CRC.
    const plain = decompressPlain(data, entry);
    verifyCrc(plain, entry, 'archive');
    return { name: entry.name, data: plain };
  }

  if (!password) throw new ZipError('this archive is password-protected — the Share Phrase is required');
  // UIDAI issues a 4-digit Share Code; older portals called it a Share Phrase and
  // allowed more characters. Do not over-validate the shape — a wrong value fails
  // the CRC check below with a message that says so.
  if (password.length < 4) {
    throw new ZipError('the Share Phrase is the 4-digit code chosen when the file was downloaded');
  }

  if (entry.aes) {
    const plain = decryptAes(data, password, entry.aes.strength);
    const out = entry.aes.actualMethod === METHOD_STORED ? plain : inflate(plain, entry.uncompressedSize);
    verifyCrc(out, entry, 'Share Phrase');
    return { name: entry.name, data: out };
  }

  // ZipCrypto: 12-byte encryption header, then the compressed stream. Both are
  // keystream-mixed, so the password seeds the keys before the header is read.
  if (data.length < 12) throw new ZipError('encrypted entry is truncated');
  const keys = new ZipCryptoKeys(password);
  const header = keys.decrypt(data.subarray(0, 12));
  const body = keys.decrypt(data.subarray(12));

  // Cheap early rejection — the writer committed to one of these two bytes.
  const expectedCheck = entry.flags & FLAG_DATA_DESCRIPTOR
    ? (entry.modTime >>> 8) & 0xff
    : (entry.crc >>> 24) & 0xff;
  if (header[11] !== expectedCheck) {
    throw new ZipError('wrong Share Phrase');
  }

  const plain = decompressPlain(body, entry);
  verifyCrc(plain, entry, 'Share Phrase');
  return { name: entry.name, data: plain };
}

function decompressPlain(data: Buffer, entry: Entry): Buffer {
  if (entry.method === METHOD_STORED) {
    if (entry.uncompressedSize && data.length !== entry.uncompressedSize) {
      throw new ZipError('stored entry size does not match the directory');
    }
    if (data.length > MAX_OUTPUT) throw new ZipError('entry is too large');
    return Buffer.from(data);
  }
  if (entry.method === METHOD_DEFLATE) return inflate(data, entry.uncompressedSize);
  if (entry.method === METHOD_AES) throw new ZipError('unsupported encryption format');
  throw new ZipError(`unsupported compression method ${entry.method}`);
}

/**
 * The authoritative password check: a wrong key cannot produce bytes whose
 * CRC-32 matches the one recorded in the directory. The value read here comes
 * from the central directory, which always carries the final CRC even when the
 * local header deferred it behind bit 3.
 */
function verifyCrc(data: Buffer, entry: Entry, what: string): void {
  if (!entry.crc) return;
  if (crc32(data) !== entry.crc) throw new ZipError(`wrong ${what}`);
}

/** Heuristic used to decide whether the upload is a ZIP or a bare XML file. */
export function looksLikeZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);
}
