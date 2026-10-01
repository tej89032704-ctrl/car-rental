-- Refresh-token lookup was an O(N) bcrypt scan.
--
-- auth.refresh() selected every row with `revoked_at IS NULL` and ran
-- bcrypt.compareSync against each one until it got a hit. bcrypt is
-- deliberately slow (~120ms per compare at cost 10) and synchronous, so the
-- cost was N x 120ms of *blocked event loop*. At N=83 that measured ~12s per
-- /auth/refresh call. Worse, when a page's requests all 401 together they all
-- try to refresh at once: the first one wins and revokes the session, the
-- queued ones find it already revoked and fall through to the caller's
-- original 401 — which is what surfaced in the UI as "Invalid or expired token".
--
-- bcrypt exists to slow down guesses of *low-entropy* secrets. A refresh token
-- is two concatenated UUIDv4s (~244 bits), so it never needed that. SHA-256 is
-- enough, and being deterministic it is also indexable — one indexed lookup
-- instead of a scan.

CREATE INDEX IF NOT EXISTS idx_sessions_refresh_hash
  ON sessions (refresh_token_hash);

-- Every pre-existing row stores a bcrypt hash ($2a$...). Those tokens cannot
-- be redeemed by the new scheme — bcrypt salts make the output
-- non-deterministic and the plaintext token is not recoverable — so they are
-- dead either way. Drop them now instead of shipping rows that can never
-- match. This signs out current sessions once; the refresh path they depended
-- on is the thing being fixed.
DELETE FROM sessions WHERE refresh_token_hash LIKE '$2%';

-- issueTokens() prunes rows whose expiry has passed so the table does not grow
-- without bound; expiry drives that DELETE.
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON sessions (expires_at);
