-- Admin 2FA hardening.
--
-- A six-digit code carries only ~20 bits, so the code itself is not the
-- defence -- the attempt cap is. Counting wrong guesses on the row lets a code
-- be burned after a handful of failures instead of staying guessable for its
-- whole ten-minute life.
ALTER TABLE otp_verifications ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

-- The 2FA check and the resend throttle both read the newest open code for one
-- user and purpose, which is exactly this index.
CREATE INDEX IF NOT EXISTS idx_otp_open
  ON otp_verifications(user_id, purpose, created_at DESC)
  WHERE consumed_at IS NULL;
