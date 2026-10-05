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

async function requestNow(query: string): Promise<GeocodeHit[] | null> {
  const url =
    `${ENDPOINT}?q=${encodeURIComponent(query)}` +
    `&format=jsonv2&limit=${LIMIT}&addressdetails=0`;

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

    const body: any = await res.json();
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
  } catch {
    // Network error, DNS failure, timeout, malformed JSON: all treated as
    // "could not resolve". Never surfaced to the caller as an exception.
    return null;
  }
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

  const run = queue.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastSentAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSentAt = Date.now();
    return await requestNow(trimmed);
  });

  // Keep the chain alive even if this link rejects, so one failure cannot
  // wedge every later lookup behind a permanently rejected promise.
  queue = run.then(
    () => undefined,
    () => undefined,
  );

  const hits = await run;
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