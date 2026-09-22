# Car Rental Platform

Multi-role car rental system built from `car-rental-app-spec.pdf`. NestJS API + 4 React portals, 6 isolated SQLite databases.

## Run it

```bash
npm install
npm run migrate          # creates all 6 DBs in apps/api/data
npm run seed:admin       # super admin: admin@platform.local / Admin@12345
npm run dev:api          # API on :4000

npm run dev:renter       # renter app   :5173  (/login shared owner+renter)
npm run dev:owner        # owner panel  :5174
npm run dev:admin        # admin panel  :5175  (/login = /admin/login, direct URL)
npm run dev:agent        # agent portal :5176  (/agent/login)
```

E2E smoke test (server must be running): `node scripts/e2e.mjs` inside `apps/api`.

## Portals & logins (spec 1.4a — hard rule)

| Surface | URL | Roles | Extra |
|---|---|---|---|
| Main | `/login` (renter-web/owner-web) | car_owner, car_renter | role auto-detected; wrong-role creds rejected with generic error |
| Admin | `/login` in admin-web (direct URL only) | super_admin | mandatory OTP 2FA after password |
| Agent | `/agent/login` | agent | separate branding |

## Databases (spec §3.1)

`auth.db`, `fleet.db`, `booking.db`, `payment.db`, `agent.db`, `notification.db` — each owned by exactly one module. Cross-module reads go through injected internal services (no cross-DB SQL joins anywhere).

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
- Uploads (KYC docs, car photos, RC/insurance) go to `apps/api/uploads`, served at `/uploads/*` — swap `StorageService` for S3 later.
- Settlement sweep runs every 10 min in the API process (deposit refunds + owner earnings after the dispute window), plus lazily on relevant reads.
