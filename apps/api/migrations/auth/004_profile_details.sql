-- Post-signup profile details: date of birth, gender, and address.
--
-- Signup collects only what is needed to authenticate (name, email, phone,
-- password, role). Everything below is demographic/address detail that a user
-- can reasonably be asked for *after* the account exists, which is what the
-- onboarding step in the portals does.
--
-- Why date_of_birth rather than age: a stored age is wrong forever. Someone
-- who signs up at 24 is still 24 in `age` next year. A date is immutable, so
-- age is derived at read time (see AuthService.toPublicUser) and stays
-- correct without a scheduled job.

ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth TEXT;

-- Restricted to a fixed set rather than free text so this stays aggregatable.
-- 'other' and 'prefer_not_to_say' are separate on purpose: one is disclosure,
-- the other is a refusal to answer, and they are not the same signal.
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT
  CHECK (gender IS NULL OR gender IN ('female','male','non_binary','other','prefer_not_to_say'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pincode TEXT;

-- Set once the user submits the onboarding form. Null means "not filled in
-- yet", which is different from "filled in with blanks" -- the portals use this
-- to decide whether to prompt, so it must not be inferred from null columns.
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed_at TEXT;

-- Location is queried by city/state for search and pickup filtering, so index
-- it rather than leaving every such query to a sequential scan of users.
CREATE INDEX IF NOT EXISTS idx_users_city ON users (city);
CREATE INDEX IF NOT EXISTS idx_users_profile_completed ON users (profile_completed_at);
