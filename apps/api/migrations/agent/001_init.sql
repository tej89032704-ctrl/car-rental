CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  monthly_salary_paise INTEGER NOT NULL DEFAULT 0,
  region TEXT NOT NULL DEFAULT '',
  employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active','inactive','terminated')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE onboarding_leads (
  id TEXT PRIMARY KEY,
  agent_user_id TEXT NOT NULL,
  lead_name TEXT NOT NULL,
  lead_phone TEXT NOT NULL,
  lead_email TEXT NOT NULL,
  lead_type TEXT NOT NULL CHECK (lead_type IN ('owner_onboarding','renter_onboarding')),
  converted_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','otp_pending','converted','dropped')),
  notes TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_leads_agent ON onboarding_leads(agent_user_id);

CREATE TABLE agent_assignments (
  id TEXT PRIMARY KEY,
  agent_user_id TEXT NOT NULL,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('kyc_first_pass','lead_followup','issue_resolution')),
  lead_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','done','closed')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX idx_assign_agent ON agent_assignments(agent_user_id);

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
