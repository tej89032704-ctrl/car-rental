-- Phone verification is a fact about the number, not a state of the account.
--
-- `users.status` used to carry the phone gate ('pending_otp' -> 'active'), but
-- signup now creates an already-active account (see AuthService.signup), so
-- status says nothing about whether a code was ever confirmed. This timestamp
-- records that separately, and updateProfile clears it when the number itself
-- changes -- a verified number that is replaced by a different one is no
-- longer verified.
ALTER TABLE users ADD COLUMN phone_verified_at TEXT;
