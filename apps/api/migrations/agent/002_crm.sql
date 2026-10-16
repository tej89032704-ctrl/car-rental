CREATE TABLE manager_memberships (
  agent_user_id TEXT PRIMARY KEY REFERENCES auth.users(id),
  manager_user_id TEXT NOT NULL REFERENCES auth.users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES auth.users(id),
  CHECK (agent_user_id <> manager_user_id)
);
CREATE INDEX idx_memberships_manager ON manager_memberships(manager_user_id);

CREATE TABLE crm_enquiries (
  id TEXT PRIMARY KEY,
  customer_user_id TEXT NOT NULL REFERENCES auth.users(id),
  manager_user_id TEXT REFERENCES auth.users(id),
  agent_user_id TEXT REFERENCES auth.users(id),
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 3 AND 160),
  city TEXT NOT NULL CHECK (length(city) BETWEEN 2 AND 80),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  budget_paise INTEGER NOT NULL CHECK (budget_paise >= 0),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','quoted','accepted','closed','lost')),
  follow_up_at TIMESTAMPTZ,
  quote_paise INTEGER CHECK (quote_paise > 0),
  quote_note TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES auth.users(id),
  CHECK (end_date > start_date),
  CHECK (agent_user_id IS NULL OR manager_user_id IS NOT NULL),
  CHECK (status NOT IN ('quoted','accepted') OR quote_paise IS NOT NULL)
);
CREATE INDEX idx_crm_customer ON crm_enquiries(customer_user_id, created_at DESC);
CREATE INDEX idx_crm_manager ON crm_enquiries(manager_user_id, status, created_at DESC);
CREATE INDEX idx_crm_agent ON crm_enquiries(agent_user_id, status, created_at DESC);
CREATE INDEX idx_crm_follow_up ON crm_enquiries(follow_up_at) WHERE is_deleted = 0;

CREATE TABLE crm_activities (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NOT NULL REFERENCES crm_enquiries(id),
  actor_id TEXT NOT NULL REFERENCES auth.users(id),
  kind TEXT NOT NULL CHECK (kind IN ('created','updated','note','accepted')),
  visibility TEXT NOT NULL CHECK (visibility IN ('internal','customer')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES auth.users(id)
);
CREATE INDEX idx_crm_activities ON crm_activities(enquiry_id, created_at DESC);
