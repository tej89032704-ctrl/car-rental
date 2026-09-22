CREATE TABLE cars (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  plate_number TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('hatchback','sedan','suv','luxury','van')),
  transmission TEXT NOT NULL CHECK (transmission IN ('manual','automatic')),
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('petrol','diesel','ev','cng')),
  seats INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','active','inactive','rejected')),
  rejection_reason TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_cars_owner ON cars(owner_id);
CREATE INDEX idx_cars_status ON cars(status);

CREATE TABLE car_photos (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL,
  file_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE car_documents (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('rc_book','insurance')),
  file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE car_availability (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL,
  date TEXT NOT NULL,
  is_available INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE (car_id, date)
);

CREATE TABLE car_pricing (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL UNIQUE,
  daily_rate_paise INTEGER NOT NULL,
  weekly_rate_paise INTEGER,
  monthly_rate_paise INTEGER,
  security_deposit_paise INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE maintenance_logs (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL,
  notes TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

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
