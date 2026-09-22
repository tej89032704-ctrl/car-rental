CREATE TABLE roles (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'system'
);

INSERT INTO roles (name, description, created_at, updated_at) VALUES
  ('super_admin', 'Platform owner - full control', datetime('now'), datetime('now')),
  ('car_owner',   'Lists own cars for rent',     datetime('now'), datetime('now')),
  ('car_renter',  'Books cars',                  datetime('now'), datetime('now')),
  ('agent',       'Field mediator, salary-based',datetime('now'), datetime('now'));

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL REFERENCES roles(name),
  status TEXT NOT NULL DEFAULT 'pending_otp' CHECK (status IN ('pending_otp','active','suspended','banned')),
  kyc_status TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending','approved','rejected')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE otp_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('phone_verify','admin_2fa','password_reset')),
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_otp_user_purpose ON otp_verifications(user_id, purpose);

CREATE TABLE role_change_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  current_role TEXT NOT NULL,
  desired_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE kyc_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('id_proof','address_proof')),
  file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','first_pass_done','approved','rejected')),
  reviewed_by TEXT,
  first_passed_by TEXT,
  rejection_reason TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_kyc_user ON kyc_documents(user_id);

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
