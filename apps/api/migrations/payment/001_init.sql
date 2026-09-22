CREATE TABLE platform_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value_text TEXT,
  value_int INTEGER,
  description TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

INSERT INTO platform_settings
  (id, key, value_int, description, updated_by, created_at, updated_at, created_by)
VALUES
  ('set-owner-sub', 'owner_subscription_monthly_paise', 10000, 'Car owner subscription price per month (paise)', 'system', datetime('now'), datetime('now'), 'system'),
  ('set-renter-life', 'renter_lifetime_fee_paise', 0, 'Renter one-time lifetime membership fee (paise); undecided - default free', 'system', datetime('now'), datetime('now'), 'system'),
  ('set-partial', 'partial_payment_percent', 20, 'Percent of rental total collected online to confirm booking', 'system', datetime('now'), datetime('now'), 'system'),
  ('set-deposit-hold', 'deposit_refund_hours', 24, 'Hours after trip completion before deposit auto-refund (dispute window)', 'system', datetime('now'), datetime('now'), 'system');

CREATE TABLE wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  pending_balance_paise INTEGER NOT NULL DEFAULT 0,
  available_balance_paise INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  payer_id TEXT NOT NULL,
  payee_id TEXT,
  amount_paise INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN
    ('booking_partial','deposit_hold','deposit_refund','extension_payment',
     'late_fee','pickup_cash','subscription_owner','renter_lifetime','refund')),
  method TEXT NOT NULL DEFAULT 'online' CHECK (method IN ('online','cash_upi_offline')),
  status TEXT NOT NULL CHECK (status IN ('held','captured','settled','refunded','failed','recorded')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_tx_booking ON transactions(booking_id);

CREATE TABLE payouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','paid','rejected')),
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  paid_at TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_payouts_user ON payouts(user_id);

CREATE TABLE refunds (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('pending','processed','failed')),
  initiated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  number TEXT NOT NULL UNIQUE,
  amount_paise INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('booking_partial','extension','late_fee','subscription')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('car_owner_monthly','renter_lifetime')),
  price_paid_paise INTEGER NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_subs_user ON subscriptions(user_id);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_value TEXT,
  after_value TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
