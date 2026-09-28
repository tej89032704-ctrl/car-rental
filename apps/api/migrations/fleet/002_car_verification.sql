-- 002_car_verification.sql
-- Live RC (VAHAN/RTO) verification for cars.
-- Each check call appends a row to car_verifications (full attempt history);
-- cars carry only the latest verdict for fast listing/badging.

ALTER TABLE cars ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified'
  CHECK (verification_status IN ('unverified', 'pending', 'verified', 'failed'));

ALTER TABLE cars ADD COLUMN verified_at TEXT;

CREATE TABLE car_verifications (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL,
  plate_number TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('mock', 'vahan', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'failed')),
  live INTEGER NOT NULL DEFAULT 0,
  registered_make TEXT,
  registered_model TEXT,
  match_make_model INTEGER NOT NULL DEFAULT 0,
  details TEXT,
  message TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE INDEX idx_car_verifications_car ON car_verifications(car_id);