# Car Rental Platform

Multi-role car rental system built from `car-rental-app-spec.pdf`. NestJS API + 5 React portals, PostgreSQL with 6 module-owned schemas. Customer and renter are the same role. See [CRM design and database contracts](docs/crm-design.md).

## Run it

```bash
npm install
# Configure DATABASE_URL in apps/api/.env (PostgreSQL).
npm run migrate          # creates/migrates the 6 PostgreSQL schemas
npm run seed:admin       # super admin: admin@platform.local / Admin@12345
npm run dev:api          # API on :4000

npm run dev:renter       # renter app   :5173  (/login shared owner+renter)
npm run dev:owner        # owner panel  :5174
npm run dev:admin        # admin panel  :5175  (/login = /admin/login, direct URL)
npm run dev:agent        # agent portal :5176  (/agent/login)
npm run dev:manager      # manager portal :5177 (/login)
```

E2E smoke test (server must be running): `node scripts/e2e.mjs` inside `apps/api`.

## Deploy (Render)

One Docker web service (`Dockerfile`, blueprint in `render.yaml`) serves the API and all five portals on one origin:

| Path | Serves |
|---|---|
| `/` | redirect to `/renter` |
| `/renter` `/owner` `/admin` `/agent` `/manager` | that portal's built `dist/` (SPA fallback) |
| `/api/...` | the Nest API |
| `/uploads/...` | owner photos and KYC documents |

Environment: `DATABASE_URL` (required) and `JWT_SECRET` (32+ random characters). Without a `JWT_SECRET` a production process still starts, on a randomly generated secret: sign-in works, but every restart signs everyone out — `/api/health` then reports `"jwt_secret": "generated"`, and setting the variable makes sessions durable. Optional `ADMIN_EMAIL` / `ADMIN_PASSWORD` for the seeded super admin, optional `DB_SSL=auto|require|disable` (default `auto`: TLS for public hostnames, plain for dotless private hosts such as Render's internal database).

Admin sign-in emails its verification code, so a deployment also needs `RESEND_API_KEY` and `MAIL_FROM` (a verified sender, e.g. `CAR-ENT <no-reply@yourdomain.com>`). Without them the admin endpoint answers `503` instead of issuing a code nobody can read. Locally both can stay unset: the code comes back as `dev_code` and the sign-in screen shows it, so the flow is testable without a mail provider.

`GET /api/health` answers 200 whenever the process is up and reports the database in its body, so a starting or unreachable database never turns into a deploy that hangs:

```json
{ "status": "ok", "uptime_seconds": 12, "database": { "ok": true, "phase": "ready" } }
```

The port is bound **before** migrations run; migrations retry in the background (`DB_INIT_RETRY_MS`, `DB_INIT_MAX_ATTEMPTS`) and a failure is reported as `"status": "degraded"` with the reason.

## Portals & logins (spec 1.4a — hard rule)

| Surface | URL | Roles | Extra |
|---|---|---|---|
| Main | `/login` (renter-web/owner-web) | car_owner, car_renter | role auto-detected; wrong-role creds rejected with generic error |
| Admin | `/login` in admin-web (direct URL only) | super_admin | mandatory OTP 2FA after password |
| Agent | `/agent/login` | agent | separate branding |
| Manager | `/login` in manager-web | manager | provisioned by super admin; assigned-team access only |

## Databases (spec §3.1)

PostgreSQL schemas: `auth`, `fleet`, `booking`, `payment`, `agent`, `notification`. CRM enquiries, activities and manager memberships belong to `agent`; identities belong to `auth`. New CRM relationships use cross-schema foreign keys. Legacy additive constraints use `NOT VALID` to preserve old rows while enforcing new writes; validate them after an integrity audit.

## CRM workflow

1. Super admin opens **Managers & Teams**, creates manager/agent accounts and assigns agents to managers.
2. Renter/customer opens **Enquiries & Quotes** and submits dates, city and budget.
3. Super admin assigns the enquiry in **Rental CRM**; manager sees only their team’s enquiries; agents see only their assigned enquiries.
4. Staff records follow-ups and internal notes, then sends a quote. Internal notes are not visible to renters.
5. Customer accepts the quote. This does **not** reserve a car, capture money or bypass owner booking approval.

Local CRM API regression: `node apps/api/scripts/crm-e2e.mjs` (requires API on :4000 and a local DATABASE_URL; creates uniquely named local fixtures). A temporary manager review account is created by the regression and its password is stored only in ignored local review credentials, never in this document.

## Confirmed business rules (Section 6, user-decided)

| Rule | Decision |
|---|---|
| 6.1 Booking | Manual owner approval; payment captured (held) at approval |
| 6.2 Payment | 20% online at confirm → 80% cash/UPI recorded by owner at pickup |
| 6.3 Cancellation | Free ≥24h before start · 50% within 24h · none after start |
| 6.4 Revenue | Subscriptions only: owner ₹100/mo, renter lifetime (configurable, default free) |
| 6.5 Deposit | Upfront hold, auto-refund 24h post-trip if no dispute |
| 6.6 Late return | 10% of daily rate per hour, capped at 1× daily rate |
| Agents | Fixed salary, no commission |

All money stored as integer paise; all timestamps UTC ISO strings; soft delete everywhere; every table has `id/created_at/updated_at/created_by`; audit logs written for all money/status changes.

## Dev conveniences

- Registration has no phone-OTP step: the account is active as soon as signup succeeds and the visitor goes straight to the optional profile step.
- OTPs that remain (admin 2FA, phone re-verification, password reset) are logged to the `notification` schema (`sms_logs`), and `/auth/otp/phone/request` still returns a `dev_otp` outside production.
- Password reset links land in `email_logs`.
- Uploads go to `apps/api/uploads`. `/uploads/*` checks database ownership: active car photos are public; KYC and car documents require authorized bearer authentication. Shared document viewers fetch private blobs without tokens in URLs.
- Settlement sweep runs every 10 min in the API process (deposit refunds + owner earnings after the dispute window), plus lazily on relevant reads.
- An empty fleet is filled with ten Bengaluru demo cars across three hosts on the first production boot, and by `npm run seed:fleet` anywhere else — otherwise a fresh database is a working site with nothing to browse. It only ever writes into an empty `cars` table; one existing row and it writes nothing. `SEED_DEMO_FLEET=0` switches it off. Once a real listing is live the demo cars step aside: any still-active demo plate is set to `inactive` — checked on every boot and again when a car is approved or an owner resumes one — which removes it from browse and the car page while keeping its rows, photos, bookings and reviews intact; `HIDE_DEMO_FLEET=1` hides them immediately instead of waiting for a real listing, and `HIDE_DEMO_FLEET=0` disables that automatic hiding. The hosts are `ravi.host@carent.local`, `ananya.host@carent.local` and `zeeshan.host@carent.local`, password `Demo@12345` (or `DEMO_OWNER_PASSWORD`).
- That fleet also gets a history: twelve completed trips across the last few months, each with the status trail it left and the two-sided reviews both parties write — so every car card shows a rating instead of "New", the car page's review list is populated, and the demo hosts' completed-trips page is not blank. The demo renters are `aarav.renter@carent.local`, `meera.renter@carent.local` and `karthik.renter@carent.local`, same `Demo@12345` password, and their My Bookings is where the history lives. A renter account that predates the seed — created before the demo renters, with no bookings of its own — also gets two past trips, so whoever is checking the portal does not sign in to an empty history; the cutoff is fixed once the demo renters exist, so later signups never get trips they did not take, and an account that already has a booking is skipped entirely. No money is invented: the bookings carry their totals, but there is no payment ledger behind them, so wallets stay at zero and the security deposit is 0 (which also stops the deposit sweep from refunding a hold that was never taken). `SEED_DEMO_HISTORY=0` switches this half off, and `npm run seed:fleet` runs both halves by hand.
- Each demo car gets four photos — side, front, rear and interior — so the card image and the detail gallery have real images to lay out. They are flat SVG illustrations generated at boot by `apps/api/src/demo-car-photos.ts` and written through the normal `StorageService`, not bundled JPEGs: `uploads/` is gitignored and the runtime image ships only `dist`, so a bundled file would never reach the container. The photo step is keyed on plate number and runs even when the cars already exist, which is how a fleet seeded by the first version of this script gets its images. Rows whose bytes have disappeared (a redeploy empties the ephemeral disk) are dropped and rewritten rather than left to render as broken images; intact photos, including an owner's own uploads, are never touched.

## Live car verification (RC / VAHAN)

Every car can be verified against the RTO (VAHAN) database — owners self-check from the owner panel
(`POST /cars/:id/verify`), and super admins re-check from the approval queue (`POST /admin/cars/:id/verify`).
Each check is appended to `car_verifications` (full attempt history) and the latest verdict is kept on the car
(`verification_status`, `verified_at`). Failed lookups and model mismatches (registered make/model ≠ listing) are
surfaced in both the admin queue and renter search ("RC verified ✓" badge on verified cars).

There is no free government lookup API, so the provider is pluggable:

| Mode | When | Live? |
|---|---|---|
| `auto` (default) | real vendor key configured → real lookup; otherwise deterministic demo | depends |
| `mock` | always | no (results tagged `DEMO`) |
| `vahan` | real vendor key; errors loudly when the key is missing | yes |

Configure in `apps/api/.env`:

```
RC_VERIFY_PROVIDER=auto            # auto | mock | vahan
# RC_VERIFY_API_KEY=...            # buy a key (Surepass/Signzy/Karza/HYPERVERGE…) to go live
# RC_VERIFY_API_ENDPOINT=...       # only if your vendor isn't already the default
```

Demo mode is fully deterministic per plate (same plate ⇒ same result), and deliberately includes both
negative paths an admin must handle: "no RC record found" and "registered model differs from listing".
The real adapter (`apps/api/src/modules/fleet/rc-verify.providers.ts`) maps the common VAHAN response shapes
defensively; re-check its `KEY_GROUPS` against your vendor's sample response once the key is provisioned.
