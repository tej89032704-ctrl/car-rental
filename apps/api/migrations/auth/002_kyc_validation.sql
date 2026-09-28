-- Tier 1 document validation + Aadhaar Paperless Offline e-KYC results.
--
-- Widens the doc_type allow-list rather than renaming anything, so existing
-- rows and every query that reads them stay valid. Postgres auto-names the
-- column CHECK as <table>_<column>_check, which is what this drops.

ALTER TABLE kyc_documents DROP CONSTRAINT IF EXISTS kyc_documents_doc_type_check;
ALTER TABLE kyc_documents ADD CONSTRAINT kyc_documents_doc_type_check CHECK (
  doc_type IN ('id_proof', 'address_proof', 'aadhaar', 'driving_license')
);

-- The document number, stored already normalised for its type:
--   aadhaar         -> `XXXX XXXX 1234`. The Aadhaar Act 2016 s.29(3) forbids
--                      keeping all 12 digits, so this is the only form that
--                      is ever written down.
--   driving_license -> the normalised Parivahan-style number (not secret).
--   anything else   -> whatever the applicant typed, or NULL.
ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS doc_number TEXT;

-- `YYYY-MM-DD`. Aadhaar never expires, so it stays NULL for those rows.
ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS doc_expiry TEXT;

-- Machine verdict for this row:
--   pass   -> every structural check passed (and any signature verified)
--   review -> verified, but something a human should look at
--   fail   -> a structural check rejected it
--   NULL   -> nothing to check, e.g. an address proof with no number
ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS verify_status TEXT
  CHECK (verify_status IS NULL OR verify_status IN ('pass', 'review', 'fail'));

-- Operator-facing explanation: which check failed, and which UIDAI key
-- verified an offline e-KYC pack.
ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS verify_detail TEXT;

ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS verified_at TEXT;

-- The demographic snapshot UIDAI signed in an offline e-KYC pack, plus the
-- cross-check verdicts: name, dob, gender, address, referenceId, issuedAt.
-- JSON as text, because every other timestamp column here is TEXT too.
ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS verified_payload TEXT;

-- Same Aadhaar submitted under two accounts is the fraud signal this table
-- exists to catch, so keep the lookup indexed.
CREATE INDEX IF NOT EXISTS idx_kyc_doc_number
  ON kyc_documents (doc_number) WHERE doc_number IS NOT NULL;
