/**
 * RC verification providers.
 *
 * The platform verifies a car's Registration Certificate against the RTO
 * (VAHAN) dataset. There is no free government API, so this ships with two
 * pluggable providers behind one normalized result shape:
 *
 *   - `mock`  deterministic demo provider. Used until a vendor key exists.
 *             Every result is flagged `live: false` so the UI can say DEMO.
 *   - `vahan` real HTTP adapter for a commercial VAHAN/RC vendor (Surepass,
 *             Signzy, Karza, HYPERVERGE, etc.). Activated by setting
 *             RC_VERIFY_API_KEY (and RC_VERIFY_API_ENDPOINT when your vendor
 *             differs from the default). Results are flagged `live: true`.
 *
 * Env knobs (all optional; `auto` is the default mode):
 *   RC_VERIFY_PROVIDER   auto | mock | vahan   — auto = live when a key is
 *                          configured, demo otherwise.
 *   RC_VERIFY_API_KEY    your vendor key (buy one later to go live).
 *   RC_VERIFY_API_ENDPOINT  POST endpoint for a VAHAN vendor.
 *
 * NOTE ON THE REAL ADAPTER: every vendor wraps the same VAHAN payload but uses
 * slightly different JSON shapes. `verifyWithVahan` maps the common field
 * names defensively, but the final response mapping should be re-checked
 * against your chosen vendor's sample response once the key is provisioned —
 * adjust the KEY_GROUPS tables and `findVehicle` walk if needed.
 */

export type RcVerdict = 'verified' | 'failed' | 'pending';

export interface RcVehicle {
  registration_number: string;
  registration_date?: string;
  rto_code?: string;
  maker?: string;
  model?: string;
  fuel_type?: string;
  fitness_upto?: string;
  insurance_upto?: string;
  insurance_valid?: boolean | null;
  owner_masked?: string;
}

export interface RcVerificationResult {
  provider: 'vahan' | 'mock';
  live: boolean;
  verdict: RcVerdict;
  vehicle: RcVehicle | null;
  message?: string;
}

export interface RcProviderConfig {
  mode: 'auto' | 'mock' | 'vahan';
  live: boolean; // will a result come from the real RTO API right now?
  key_configured: boolean;
  endpoint: string;
}

export function rcProviderConfig(): RcProviderConfig {
  const raw = String(process.env.RC_VERIFY_PROVIDER || 'auto').toLowerCase();
  const key = process.env.RC_VERIFY_API_KEY || '';
  const endpoint = process.env.RC_VERIFY_API_ENDPOINT || '';
  const mode = raw === 'mock' || raw === 'vahan' ? raw : 'auto';
  const live = mode === 'vahan' || (mode === 'auto' && Boolean(key));
  return { mode, live, key_configured: Boolean(key), endpoint };
}

/** Choose the provider for the next check. Throws a helpful error on misuse. */
export function resolveRcProvider(): 'vahan' | 'mock' {
  const c = rcProviderConfig();
  if (c.live) return 'vahan';
  if (c.mode === 'vahan') {
    throw new Error(
      'RC_VERIFY_PROVIDER=vahan but RC_VERIFY_API_KEY is not set. ' +
        'Add it (and RC_VERIFY_API_ENDPOINT) to apps/api/.env, or switch to provider=auto (demo) ' +
        'until you have a vendor key.',
    );
  }
  return 'mock';
}

// ---------------------------------------------------------------------------
// Deterministic demo provider
// ---------------------------------------------------------------------------

const REGION_CODES = ['KA', 'MH', 'DL', 'TS', 'TN', 'GJ', 'UP', 'HR', 'PB', 'WB'];
const FALLBACK_MODELS = [
  { maker: 'Honda', model: 'City' },
  { maker: 'Hyundai', model: 'Creta' },
  { maker: 'Maruti Suzuki', model: 'Baleno' },
  { maker: 'Mahindra', model: 'XUV700' },
  { maker: 'Tata Motors', model: 'Nexon' },
  { maker: 'Kia', model: 'Seltos' },
  { maker: 'Toyota', model: 'Fortuner' },
  { maker: 'Renault', model: 'Kwid' },
];
const OWNER_FIRST = ['RAJESH', 'PRIYA', 'AMIT', 'SUNITA', 'VIKRAM', 'KAVYA', 'MANOJ', 'RITU', 'DEEPAK', 'ANJALI'];

function hashOf(s: string): number {
  let h = 2166136261;
  for (const ch of s.toUpperCase()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Deterministic, plausible RC record for a plate. The same plate always yields
 * the same result (so re-verifying is stable), and the flags shown to admins
 * (no-record failure, model mismatch vs the listing) are reachable in demo too.
 */
export function verifyWithMock(
  plate: string,
  listed: { make: string; model: string; year: number; fuel_type?: string },
): RcVerificationResult {
  const h = hashOf(plate);
  if (h % 64 === 0) {
    return {
      provider: 'mock',
      live: false,
      verdict: 'failed',
      vehicle: null,
      message: 'No RC record found for this registration number (RTO lookup returned empty).',
    };
  }
  const mismatch = h % 8 === 0;
  const reg = mismatch ? FALLBACK_MODELS[h % FALLBACK_MODELS.length] : { maker: listed.make, model: listed.model };
  const region = REGION_CODES[h % REGION_CODES.length];
  const year = listed.year || 2021;
  const registration = new Date(Date.UTC(year, 0, 1) + (h % 360) * 864e5);
  const fitness = new Date(Date.UTC(year + 15, 0, 1));
  const insurance = new Date(Date.now() + (h % 365) * 864e5);
  const owner = OWNER_FIRST[h % OWNER_FIRST.length];
  return {
    provider: 'mock',
    live: false,
    verdict: 'verified',
    vehicle: {
      registration_number: plate.toUpperCase().replace(/\s+/g, ''),
      registration_date: isoDay(registration),
      rto_code: `${region}${pad2((h % 9) + 1)}`,
      maker: reg.maker,
      model: reg.model,
      fuel_type: listed.fuel_type ?? 'petrol',
      fitness_upto: isoDay(fitness),
      insurance_upto: isoDay(insurance),
      insurance_valid: true,
      owner_masked: `${owner} ****`,
    },
  };
}

// ---------------------------------------------------------------------------
// Real VAHAN vendor adapter (used once an API key is configured)
// ---------------------------------------------------------------------------

const KEY_GROUPS: Record<keyof RcVehicle & string, string[]> = {
  registration_number: ['registration_number', 'registration_no', 'reg_no', 'vehicle_number', 'vehicle_no', 'rc_number'],
  registration_date: ['registration_date', 'reg_date', 'registration_dt', 'vehicle_reg_date'],
  rto_code: ['rto_code', 'rto', 'rta_code', 'office_code'],
  maker: ['maker', 'make', 'maker_description', 'vehicle_maker'],
  model: ['model', 'model_description', 'vehicle_model', 'model_name'],
  fuel_type: ['fuel_type', 'fuel', 'fuel_description'],
  fitness_upto: ['fitness_upto', 'fitness_up_to', 'fitness_valid_upto', 'fitness_validity'],
  insurance_upto: ['insurance_upto', 'insurance_valid_upto', 'insurance_validity', 'insurance_expiry'],
  insurance_valid: ['insurance_valid', 'insurance_status', 'insurance_validity_status'],
  owner_masked: ['owner_name', 'name', 'owners_name', 'rc_owner_name'],
};

function firstValue(obj: any, keys: string[]): any {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** Walk the common response containers most VAHAN vendors wrap the record in. */
function findVehicle(body: any): any | null {
  if (!body || typeof body !== 'object') return null;
  const candidates = [body, body.data, body.result, body.response, body.data?.data, body.data?.result];
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const inner = c.vehicle_details ?? c.vehicle_data ?? c.rc_details ?? c.data ?? c;
    if (inner && typeof inner === 'object' && firstValue(inner, KEY_GROUPS.registration_number) !== undefined) {
      return inner;
    }
  }
  return null;
}

function vendorVerdict(body: any): RcVerdict {
  const code = firstValue(body, ['success', 'status', 'status_code', 'code']);
  if (typeof code === 'boolean') return code ? 'verified' : 'failed';
  const s = String(code ?? '').toLowerCase();
  if (s === 'success' || s === 'verified' || s === '1' || s === 'true' || s === '200') return 'verified';
  if (s === 'fail' || s === 'failed' || s === '0' || s === 'false' || s === '404' || s === '400') return 'failed';
  return 'pending';
}

export async function verifyWithVahan(
  plate: string,
  _listed: { make: string; model: string },
): Promise<RcVerificationResult> {
  const c = rcProviderConfig();
  if (!c.endpoint) {
    throw new Error(
      'RC_VERIFY_API_ENDPOINT is not set — point it at your VAHAN/RTO vendor ' +
        '(e.g. Surepass, Signzy, Karza) or use provider=auto/mock for the demo.',
    );
  }
  if (!c.key_configured) {
    throw new Error('RC_VERIFY_API_KEY is not set — paste your vendor key to go live.');
  }
  const key = process.env.RC_VERIFY_API_KEY || '';

  const res = await fetch(c.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'x-api-key': key,
    },
    // Vendors commonly accept any of these; sending all three keeps the
    // adapter working across the field-name differences of the top vendors.
    body: JSON.stringify({ vehicle_number: plate, registration_number: plate, vehicle_no: plate }),
    signal: AbortSignal.timeout(12000),
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON — fall through to failed */
  }

  if (!res.ok) {
    return {
      provider: 'vahan',
      live: true,
      verdict: 'failed',
      vehicle: null,
      message: `RTO vendor returned HTTP ${res.status}.`,
    };
  }

  const v = findVehicle(body);
  if (!v) {
    return {
      provider: 'vahan',
      live: true,
      verdict: vendorVerdict(body) === 'pending' ? 'pending' : 'failed',
      vehicle: null,
      message: 'RTO vendor returned no vehicle record for this registration number.',
    };
  }

  const f = (k: keyof RcVehicle & string): string | undefined => {
    const raw = firstValue(v, KEY_GROUPS[k]);
    if (raw === undefined) return undefined;
    return typeof raw === 'number' ? String(raw) : String(raw);
  };

  const verdict = vendorVerdict(body);
  return {
    provider: 'vahan',
    live: true,
    verdict,
    vehicle: {
      registration_number: String(f('registration_number') ?? plate).toUpperCase(),
      registration_date: f('registration_date'),
      rto_code: f('rto_code'),
      maker: f('maker'),
      model: f('model'),
      fuel_type: f('fuel_type'),
      fitness_upto: f('fitness_upto'),
      insurance_upto: f('insurance_upto'),
      insurance_valid:
        f('insurance_valid') === undefined ? null : /true|valid|active|1|yes/i.test(String(f('insurance_valid'))),
      owner_masked: f('owner_masked') ? maskOwner(String(f('owner_masked'))) : undefined,
    },
  };
}

/** Show only the first word of the owner name; everything else is masked. */
function maskOwner(name: string): string {
  const first = name.trim().split(/\s+/)[0] || '';
  return `${first} ****`;
}