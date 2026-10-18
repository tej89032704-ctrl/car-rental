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

- OTPs are logged to `notification.db` (`sms_logs`) and also returned as `dev_otp` in signup/request responses.
- Password reset links land in `email_logs`.
- Uploads go to `apps/api/uploads`. `/uploads/*` checks database ownership: active car photos are public; KYC and car documents require authorized bearer authentication. Shared document viewers fetch private blobs without tokens in URLs.
- Settlement sweep runs every 10 min in the API process (deposit refunds + owner earnings after the dispute window), plus lazily on relevant reads.

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
