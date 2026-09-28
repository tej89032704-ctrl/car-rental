# UIDAI offline e-KYC signing certificates

Public certificates UIDAI uses to sign the **Aadhaar Paperless Offline e-KYC** XML
(the share-phrase ZIP from myAadhaar) and the Secure QR.

They are *public keys*. Nothing here is secret and none of it can be used to forge
a signature — only UIDAI's private key can.

| File | Subject | Valid | Source |
| --- | --- | --- | --- |
| `uidai_offline_publickey_2026.cer` | DS Unique Identification Authority of India 06 | 2026-02-03 → 2029-02-03 | `https://uidai.gov.in/images/authDoc/uidai_offline_publickey_2026.cer` (via Wayback Machine, snapshot 2026-06-13 — UIDAI's own server 404s non-browser clients) |
| `uidai_offline_publickey_17022026.cer` | DS Unique Identification Authority of India 05 | 2024-02-21 → 2026-02-16 | mirrored by `anon-aadhaar/anon-aadhaar` |
| `uidai_offline_publickey_26022021.cer` | DS Unique Identification Authority of India 05 | 2021-02-26 → 2024-02-27 | mirrored by `anon-aadhaar/anon-aadhaar` |

## Why expired certs stay in the list

UIDAI rotates its document-signer keys, but the Aadhaar cards and offline e-KYC
files people already hold were signed with the *old* keys and stay valid for years.
Verification pins the **public key**, not the certificate validity window — so a
2019-signed XML must still verify against the 2019 cert. See `aadhaar-ekyc.ts`.

UIDAI's certificate listing page: <https://uidai.gov.in/en/data-and-download>
(aadhaar-paperless-offline-e-kyc public key certificates table)

## Rotating

When UIDAI publishes a new one, drop it in this folder with a
`uidai_offline_publickey_<date>.cer` name. `aadhaar-ekyc.ts` loads every file in
this directory automatically — no code change needed.
