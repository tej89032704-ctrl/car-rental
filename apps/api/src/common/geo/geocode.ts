/**
 * City -> coordinates resolution via Nominatim (OpenStreetMap).
 *
 * Why this lives on the server and is not called from the browser:
 *
 * 1. Nominatim's usage policy requires every request to identify its caller
 *    with a real User-Agent. `User-Agent` is a forbidden header name in fetch,
 *    so a browser cannot comply; requests made without one are blocked.
 * 2. The public endpoint allows roughly one request per second. Serialising
 *    calls here means our own traffic cannot exceed that no matter how many
 *    users hit the location picker at once, and one user's save cannot be
 *    penalised because someone else just searched.
 *
 * Best-effort by construction: every failure path resolves to `null`. A profile
 * save must never fail because a third-party geocoder is slow or down, so the
 * caller stores no coordinates and carries on.
 */

/** Nominatim search endpoint. */
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

/** Nominatim reverse endpoint: a point back to an address. */
const REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

/** A city centroid is plenty for "roughly where is this car"; 5 is a good balance. */
const LIMIT = 5;

/** Nominatim asks for >=1s between requests. One shared promise chain enforces it. */
const MIN_GAP_MS = 1100;

/** Generous enough for a cold TLS handshake, short enough not to stall a save. */
const TIMEOUT_MS = 5000;

/**
 * Nominatim's policy asks for something that identifies the application and
 * gives a way to be contacted. Override with GEO_USER_AGENT when deploying.
 */
const USER_AGENT =
  process.env.GEO_USER_AGENT || 'car-ent/1.0 (self-hosted demo; geocoding via Nominatim)';

export interface GeocodeHit {
  latitude: number;
  longitude: number;
  label: string;
  kind: string;
}

type CacheEntry = { at: number; hits: GeocodeHit[] };

/**
 * Bounded in-process cache. Nominatim results for a city do not change, and
 * every cache hit is one fewer request against the shared rate limit. The bound
 * keeps a long-lived process from accumulating entries indefinitely.
 */
const CACHE = new Map<string, CacheEntry>();
const CACHE_MAX = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Serialises requests and keeps the gap between them, so callers cannot race. */
let queue: Promise<unknown> = Promise.resolve();
let lastSentAt = 0;

function cacheGet(key: string): GeocodeHit[] | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.hits;
}

function cacheSet(key: string, hits: GeocodeHit[]): void {
  // Simple FIFO eviction: Map preserves insertion order, so the first key is the
  // oldest. Re-inserting on hit would make it LRU, which is not worth the code.
  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(key, { at: Date.now(), hits });
}

/** Nominatim returns coordinates as strings; reject anything that is not a real point. */
function toNumber(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
  if (!Number.isFinite(n)) return null;
  if (n < -90 || n > 90) return null;
  return n;
}

/** One outbound call to Nominatim. Returns null on any failure. */
async function send(url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        // Nominatim serves very compressed JSON; asking for it keeps the
        // response small without changing the payload shape.
        'Accept-Encoding': 'gzip',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Network error, DNS failure, timeout, malformed JSON: all treated as
    // "could not resolve". Never surfaced to the caller as an exception.
    return null;
  }
}

/**
 * Run one call through the shared queue, keeping Nominatim's one-per-second
 * gap. Every lookup in this file goes through here, so parallel users cannot
 * burst past the limit and get the whole server blocked.
 */
async function queued<T>(run: () => Promise<T>): Promise<T> {
  const job = queue.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastSentAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSentAt = Date.now();
    return await run();
  });
  // Keep the chain alive even if this link rejects, so one failure cannot
  // wedge every later lookup behind a permanently rejected promise.
  queue = job.then(
    () => undefined,
    () => undefined,
  );
  return await job;
}

async function requestNow(query: string): Promise<GeocodeHit[] | null> {
  const url =
    `${ENDPOINT}?q=${encodeURIComponent(query)}` +
    `&format=jsonv2&limit=${LIMIT}&addressdetails=0`;

  const body: any = await send(url);
  if (!Array.isArray(body)) return null;

  const hits: GeocodeHit[] = [];
  for (const row of body) {
    const lat = toNumber(row?.lat);
    const lon = toNumber(row?.lon);
    // `lon` is not latitude-bounded, so range-check it separately.
    if (lat === null || lon === null || lon < -180 || lon > 180) continue;
    hits.push({
      latitude: lat,
      longitude: lon,
      label: typeof row.display_name === 'string' ? row.display_name : query,
      kind: typeof row.addresstype === 'string' ? row.addresstype : 'place',
    });
  }
  return hits;
}

/**
 * Resolve free text to candidate points, best first. Returns `[]` when the
 * query resolves to nothing and `null` when the lookup itself failed -- the
 * difference lets a caller tell "no such place" from "geocoder unreachable".
 */
export async function geocode(query: string): Promise<GeocodeHit[] | null> {
  const trimmed = (query ?? '').trim().slice(0, 120);
  if (trimmed.length < 2) return [];

  const key = trimmed.toLowerCase();
  const cached = cacheGet(key);
  if (cached) return cached;

  const hits = await queued(() => requestNow(trimmed));
  if (hits === null) return null;
  cacheSet(key, hits);
  return hits;
}

/**
 * Best-effort single-point resolution for a profile save. Returns null when
 * nothing resolved, which is the normal outcome for an unknown or ambiguous
 * city -- the caller stores no coordinates and the user can drop a pin instead.
 */
export async function geocodeFirst(query: string): Promise<GeocodeHit | null> {
  const hits = await geocode(query);
  return hits && hits.length ? hits[0] : null;
}

/* --------------------------- address details ----------------------------- *
 * The two lookups below exist so the address form can fill itself: one point
 * back to an address (after the user drags the pin), and one PIN code forward
 * to the areas it covers. Both are cached by their input, which is what keeps a
 * half-dozen keystrokes inside Nominatim's rate limit.
 */

export interface AddressParts {
  address_line: string;
  city: string;
  state: string;
  pincode: string;
  label: string;
  /**
   * Administrative district behind a fallback answer, kept only so the caller
   * can use it when no city lookup succeeds. Never displayed on its own.
   */
  county?: string;
}

/** A place a PIN code covers, as offered to the user to pick from. */
export interface PostalPlace {
  area: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
}

type LookupEntry = { at: number; value: unknown };
const LOOKUP_CACHE = new Map<string, LookupEntry>();
const LOOKUP_MAX = 400;

function lookupGet<T>(key: string): T | null {
  const hit = LOOKUP_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    LOOKUP_CACHE.delete(key);
    return null;
  }
  return hit.value as T;
}

function lookupSet(key: string, value: unknown): void {
  if (LOOKUP_CACHE.size >= LOOKUP_MAX) {
    const oldest = LOOKUP_CACHE.keys().next().value;
    if (oldest !== undefined) LOOKUP_CACHE.delete(oldest);
  }
  LOOKUP_CACHE.set(key, { at: Date.now(), value });
}

/** First non-empty string among the candidates, trimmed. */
function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Nominatim's address object -> the four fields the profile form actually has. */
function toAddressParts(address: any, fallbackLabel = ''): AddressParts {
  const a = address && typeof address === 'object' ? address : {};
  const street = firstString(a.house_number, a.building);
  const road = firstString(a.road, a.pedestrian, a.footway, a.street, a.residential);
  const area = firstString(a.neighbourhood, a.suburb, a.quarter, a.hamlet, a.village);
  const city = firstString(a.city, a.town, a.municipality, a.village, a.county, a.state_district);
  const addressLine = [street, road, area && !road ? area : ''].filter(Boolean).join(', ');

  return {
    // Falling back to the area keeps a useful line in the box even for a point
    // that has no street recorded, instead of leaving it blank.
    address_line: addressLine || area || city || fallbackLabel,
    city,
    state: firstString(a.state, a.state_district),
    pincode: firstString(a.postcode).replace(/[^0-9]/g, '').slice(0, 6),
    label: fallbackLabel,
  };
}

/**
 * A point -> the address at that point. `null` means the lookup failed, which is
 * different from an address with nothing filled in: the caller keeps whatever
 * the user typed rather than clearing the form because a server was slow.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<AddressParts | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const key = `rev:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const cached = lookupGet<AddressParts>(key);
  if (cached) return cached;

  const url =
    `${REVERSE_ENDPOINT}?lat=${latitude}&lon=${longitude}` +
    `&format=jsonv2&addressdetails=1&zoom=18`;

  const body: any = await queued(() => send(url));
  const nominatim =
    body && typeof body === 'object' && !body.error
      ? toAddressParts(body.address, firstString(body.display_name))
      : null;
  // An empty answer is as useless as a failed one: the form would clear nothing
  // and the user would see a pin with no address beside it.
  let parts = nominatim && hasAddress(nominatim) ? nominatim : await fallbackReverse(latitude, longitude);
  if (!parts) return null;
  // Photon knows the street but files the taluk as the city ("Bangalore South"
  // for a point in Bengaluru). Fill the gaps from the second provider only when
  // something is actually missing, so the common case is one request.
  if (!parts.city) {
    const wider = await bigDataCloudAddress(latitude, longitude);
    if (wider) {
      parts = {
        ...parts,
        address_line: parts.address_line || wider.city,
        city: wider.city || parts.city,
        state: parts.state || wider.state,
        pincode: parts.pincode || wider.pincode,
        label: parts.label || wider.city,
      };
    }
    // Still nothing: the service that supplies city names is unreachable from
    // this host. The district name at least puts a real place in the box, and
    // the box is editable, which beats leaving it blank.
    if (!parts.city && parts.county) parts = { ...parts, city: parts.county };
  }
  lookupSet(key, parts);
  return parts;
}

/**
 * A point -> address when Nominatim has nothing to say, best effort.
 *
 * The public Nominatim instance refuses much datacentre traffic, and a Render
 * dyno is exactly that: in production every lookup came back empty, so "Use my
 * location" dropped a pin and left the address boxes blank. Two keyless
 * services over the same OpenStreetMap data cover for it: Photon for the
 * street-level line (it carries house numbers and neighbourhoods) and
 * BigDataCloud for the city/state/PIN, which Photon often files under the
 * county instead. Either alone leaves a hole; together they fill all four.
 */
async function fallbackReverse(latitude: number, longitude: number): Promise<AddressParts | null> {
  const photon = await photonReverse(latitude, longitude);
  if (photon) return photon;

  const wider = await bigDataCloudAddress(latitude, longitude);
  if (!wider) return null;
  return {
    // Nothing street-level survived, so the finest name available stands in for
    // the address line rather than leaving the box empty.
    address_line: wider.city,
    city: wider.city,
    state: wider.state,
    pincode: wider.pincode,
    label: wider.city,
  };
}

/** True when a lookup actually named something, rather than returning {}. */
function hasAddress(a: AddressParts): boolean {
  return Boolean(a.address_line || a.city || a.state || a.pincode);
}

/**
 * Photon (komoot) reverse lookup: street-level detail, keyless.
 *
 * Photon names its fields slightly differently (housenumber/street/district),
 * so its properties are folded into the Nominatim shape before parsing.
 */
const PHOTON_REVERSE = 'https://photon.komoot.io/reverse';
const BDC_ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

/** City/state/PIN for a point, keyless. `null` when the service is unreachable. */
async function bigDataCloudAddress(latitude: number, longitude: number) {
  try {
    const res = await fetch(
      `${BDC_ENDPOINT}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
      {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const body: any = await res.json();
    const city = firstString(body?.city, body?.locality, body?.principalSubdivision);
    return {
      city,
      state: firstString(body?.principalSubdivision),
      pincode: firstString(body?.postcode).replace(/[^0-9]/g, '').slice(0, 6),
    };
  } catch {
    return null;
  }
}

async function photonReverse(latitude: number, longitude: number): Promise<AddressParts | null> {
  const url = `${PHOTON_REVERSE}?lat=${latitude}&lon=${longitude}&limit=1&lang=en`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body: any = await res.json();
    const props = body?.features?.[0]?.properties;
    if (!props || typeof props !== 'object') return null;

    const parts = toAddressParts(
      {
        house_number: props.housenumber,
        road: firstString(props.street, props.housename),
        suburb: firstString(props.district, props.locality, props.neighbourhood),
        // Deliberately no `county`: Photon's county for a Bengaluru point is the
        // taluk ("Bangalore South"), and handing that to the parser as the city
        // would stop the wider lookup below from ever finding the real one.
        city: firstString(props.city, props.town, props.village, props.municipality),
        state: props.state,
        postcode: props.postcode,
      },
      firstString(props.name, props.street, props.city),
    );
    if (!hasAddress(parts)) return null;
    const county = firstString(props.county, props.state_district, props.city_district);
    return county ? { ...parts, county } : parts;
  } catch {
    return null;
  }
}

/**
 * The name to put on a PIN chip: the neighbourhood the PIN sits in.
 *
 * Nominatim's postal rows are administrative boundary relations, so their
 * `suburb` is not always a neighbourhood -- it can be a municipal ward code
 * ("F/S Ward") or, for a city with no finer division, the PIN itself. A chip
 * reading "110001 · New Delhi, Delhi" tells the user nothing they did not just
 * type, and "F/S Ward" tells them nothing at all, so both are rejected in
 * favour of the city.
 */
function pickArea(address: any, city: string, pin: string): string {
  const a = address && typeof address === 'object' ? address : {};
  const candidates = [
    a.suburb, a.neighbourhood, a.quarter, a.hamlet, a.village,
  ];
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (!value) continue;
    // The PIN itself, any digits-only code, and ward/zone labels are all
    // identifiers rather than places.
    if (/^[0-9\s-]+$/.test(value)) continue;
    if (/^(ward|zone|block|sector)\b/i.test(value)) continue;
    if (/^[A-Za-z]\/[A-Za-z]\b/.test(value)) continue;
    if (pin && value.includes(pin)) continue;
    // Equal to the city reads as a duplicate: the chip already prints the
    // city and state beside the area name.
    if (city && value.toLowerCase() === city.toLowerCase()) continue;
    return value;
  }
  return '';
}

/**
 * A PIN code -> the places it covers, best first.
 *
 * Nominatim has no postal-code index of its own, so the PIN is searched as
 * free text restricted to India and the rows are filtered down to the ones
 * that actually carry that postcode. That keeps the list honest: a PIN the
 * geocoder knows nothing about returns `[]` rather than a wrong address.
 */
export async function lookupPostalCode(pincode: string): Promise<PostalPlace[] | null> {
  const pin = String(pincode || '').replace(/[^0-9]/g, '');
  if (pin.length !== 6) return [];

  const key = `pin:${pin}`;
  const cached = lookupGet<PostalPlace[]>(key);
  if (cached) return cached;

  const url =
    `${ENDPOINT}?q=${encodeURIComponent(`${pin}, India`)}` +
    `&format=jsonv2&limit=12&addressdetails=1&countrycodes=in`;

  const body: any = await queued(() => send(url));
  if (!Array.isArray(body)) return null;

  const out: PostalPlace[] = [];
  const seen = new Set<string>();
  for (const row of body) {
    const parts = toAddressParts(row?.address, firstString(row?.display_name));
    if (parts.pincode !== pin) continue;
    const lat = toNumber(row?.lat);
    const lon = toNumber(row?.lon);
    if (lat === null || lon === null) continue;

    const area = pickArea(row?.address, parts.city, pin);
    const dedupe = `${area}|${parts.city}|${parts.state}`.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    out.push({ area, city: parts.city, state: parts.state, pincode: pin, latitude: lat, longitude: lon });
    if (out.length >= 6) break;
  }

  lookupSet(key, out);
  return out;
}