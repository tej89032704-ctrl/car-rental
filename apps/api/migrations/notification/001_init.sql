CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id);

CREATE TABLE email_logs (
  id TEXT PRIMARY KEY,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE sms_logs (
  id TEXT PRIMARY KEY,
  to_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE push_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'web',
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
