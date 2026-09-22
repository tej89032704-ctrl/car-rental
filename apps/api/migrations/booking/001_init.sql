CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL,
  renter_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','ongoing','completed','cancelled','rejected')),
  total_amount_paise INTEGER NOT NULL,
  online_paid_paise INTEGER NOT NULL DEFAULT 0,
  remaining_due_paise INTEGER NOT NULL DEFAULT 0,
  security_deposit_paise INTEGER NOT NULL DEFAULT 0,
  late_fee_paise INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  cancelled_at TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_bookings_renter ON bookings(renter_id);
CREATE INDEX idx_bookings_owner ON bookings(owner_id);
CREATE INDEX idx_bookings_car ON bookings(car_id);
CREATE INDEX idx_bookings_status ON bookings(status);

CREATE TABLE booking_status_history (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_bsh_booking ON booking_status_history(booking_id);

CREATE TABLE trip_extensions (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  requested_end_date TEXT NOT NULL,
  additional_days INTEGER NOT NULL,
  additional_amount_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  decided_by TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_ext_booking ON trip_extensions(booking_id);

CREATE TABLE cancellations (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  cancelled_by TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free','partial_50','no_refund')),
  refund_amount_paise INTEGER NOT NULL DEFAULT 0,
  penalty_amount_paise INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE disputes (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  raised_by TEXT NOT NULL,
  against_user_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution_note TEXT,
  refund_amount_paise INTEGER NOT NULL DEFAULT 0,
  penalty_amount_paise INTEGER NOT NULL DEFAULT 0,
  resolved_by TEXT,
  resolved_at TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_disputes_status ON disputes(status);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('car','owner','renter')),
  target_user_id TEXT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_reviews_target ON reviews(target_type, target_user_id);

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
