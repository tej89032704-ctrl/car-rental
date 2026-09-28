-- ONE-TIME restoration of baseline demo rows destroyed by the reviews-e2e.ts
-- cleanup bug (unguarded booking-scope SELECT wiped payment/refund/review rows
-- for ALL bookings on 2026-09-28). Every value below is reconstructed from
-- surviving evidence:
--   * booking.audit_logs / payment.audit_logs (paid_online amounts, invoice
--     numbers, wallet.settled credits of 90000 x3, trip/review timestamps)
--   * booking.cancellations (tier=free, refund_amount_paise=230000)
--   * payment.wallets (270000 credited - 150000 payouts = 120000 available)
--   * fleet.car_pricing (daily_rate 150000 -> extension = 1 day @ 150000)
--   * refund-tier logic in bookings.service (2 cancel refunds + 3 auto
--     deposit sweeps = the 5 baseline refund rows)
-- Idempotent: ON CONFLICT (id) DO NOTHING.
-- Run: psql -U postgres -d cr_dev -f scripts/restore-baseline-2026-09-28.sql
BEGIN;

-- 0) e2e audit residue from the same (fixed) run: rows created 2026-09-28 17:38
--    (baseline audit trail ends 2026-09-22).
DELETE FROM booking.audit_logs WHERE created_at >= '2026-09-28T17:00:00';

-- 1) transactions (16) ------------------------------------------------------
-- booking 0315ba3a (A: completed, extended, wallet settled 90000)
INSERT INTO payment.transactions (id, booking_id, payer_id, payee_id, amount_paise, type, method, status, note, created_at, updated_at, created_by) VALUES
('f0a10001-0000-4000-8000-000000000001','0315ba3a-5643-4dac-ae5f-76538ecb5629','79906dbe-2b0d-400b-9f5b-30b8da63fe8b','ba26cc07-0ec4-42e5-817d-472030a8491e',90000,'booking_partial','online','settled','20% partial held','2026-08-23T06:06:22.870Z','2026-08-23T06:06:22.870Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a10002-0000-4000-8000-000000000002','0315ba3a-5643-4dac-ae5f-76538ecb5629','79906dbe-2b0d-400b-9f5b-30b8da63fe8b',NULL,200000,'deposit_hold','online','held','Security deposit held','2026-08-23T06:06:22.870Z','2026-08-23T06:06:22.870Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a10003-0000-4000-8000-000000000003','0315ba3a-5643-4dac-ae5f-76538ecb5629','79906dbe-2b0d-400b-9f5b-30b8da63fe8b','ba26cc07-0ec4-42e5-817d-472030a8491e',240000,'pickup_cash','cash_upi_offline','recorded','Remaining balance collected in person at pickup','2026-08-23T06:06:22.895Z','2026-08-23T06:06:22.895Z','ba26cc07-0ec4-42e5-817d-472030a8491e'),
('f0a10004-0000-4000-8000-000000000004','0315ba3a-5643-4dac-ae5f-76538ecb5629','platform','79906dbe-2b0d-400b-9f5b-30b8da63fe8b',200000,'deposit_refund','online','refunded','Auto refund after dispute window (24h)','2026-08-24T06:06:22.950Z','2026-08-24T06:06:22.950Z','system'),
-- booking c6200d60 (X: cancelled, tier=free -> rental 230000 + deposit 200000 refunded)
('f0a10005-0000-4000-8000-000000000005','c6200d60-4c43-40a0-821e-f024fee0f851','79906dbe-2b0d-400b-9f5b-30b8da63fe8b','ba26cc07-0ec4-42e5-817d-472030a8491e',230000,'booking_partial','online','held','20% partial held','2026-08-23T06:06:23.030Z','2026-08-23T06:06:23.030Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a10006-0000-4000-8000-000000000006','c6200d60-4c43-40a0-821e-f024fee0f851','79906dbe-2b0d-400b-9f5b-30b8da63fe8b',NULL,200000,'deposit_hold','online','held','Security deposit held','2026-08-23T06:06:23.030Z','2026-08-23T06:06:23.030Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a10007-0000-4000-8000-000000000007','c6200d60-4c43-40a0-821e-f024fee0f851','platform','79906dbe-2b0d-400b-9f5b-30b8da63fe8b',230000,'refund','online','refunded','Cancellation (free)','2026-08-23T06:06:23.043Z','2026-08-23T06:06:23.043Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a10008-0000-4000-8000-000000000008','c6200d60-4c43-40a0-821e-f024fee0f851','platform','79906dbe-2b0d-400b-9f5b-30b8da63fe8b',200000,'deposit_refund','online','refunded','Deposit released on cancellation (free)','2026-08-23T06:06:23.043Z','2026-08-23T06:06:23.043Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
-- booking 9b6e38a0 (C: paid online 90000, invoice INV-1790075778932-750)
('f0a10009-0000-4000-8000-000000000009','9b6e38a0-6e7b-4f6b-a0ec-98196330d360','79906dbe-2b0d-400b-9f5b-30b8da63fe8b','ba26cc07-0ec4-42e5-817d-472030a8491e',90000,'booking_partial','online','settled','20% partial held','2026-09-22T11:16:18.933Z','2026-09-22T11:16:18.933Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a10010-0000-4000-8000-000000000010','9b6e38a0-6e7b-4f6b-a0ec-98196330d360','79906dbe-2b0d-400b-9f5b-30b8da63fe8b',NULL,200000,'deposit_hold','online','held','Security deposit held','2026-09-22T11:16:18.933Z','2026-09-22T11:16:18.933Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a10011-0000-4000-8000-000000000011','9b6e38a0-6e7b-4f6b-a0ec-98196330d360','79906dbe-2b0d-400b-9f5b-30b8da63fe8b','ba26cc07-0ec4-42e5-817d-472030a8491e',360000,'pickup_cash','cash_upi_offline','recorded','Remaining balance collected in person at pickup','2026-09-22T11:16:18.956Z','2026-09-22T11:16:18.956Z','ba26cc07-0ec4-42e5-817d-472030a8491e'),
('f0a10012-0000-4000-8000-000000000012','9b6e38a0-6e7b-4f6b-a0ec-98196330d360','platform','79906dbe-2b0d-400b-9f5b-30b8da63fe8b',200000,'deposit_refund','online','refunded','Auto refund after dispute window (24h)','2026-09-23T11:16:18.966Z','2026-09-23T11:16:18.966Z','system'),
-- booking 2aabdcef (D: paid online 90000, invoice INV-1790076138964-531)
('f0a10013-0000-4000-8000-000000000013','2aabdcef-ae66-4481-aff4-cbcce43b246c','79906dbe-2b0d-400b-9f5b-30b8da63fe8b','ba26cc07-0ec4-42e5-817d-472030a8491e',90000,'booking_partial','online','settled','20% partial held','2026-09-22T11:22:18.965Z','2026-09-22T11:22:18.965Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a10014-0000-4000-8000-000000000014','2aabdcef-ae66-4481-aff4-cbcce43b246c','79906dbe-2b0d-400b-9f5b-30b8da63fe8b',NULL,200000,'deposit_hold','online','held','Security deposit held','2026-09-22T11:22:18.965Z','2026-09-22T11:22:18.965Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a10015-0000-4000-8000-000000000015','2aabdcef-ae66-4481-aff4-cbcce43b246c','79906dbe-2b0d-400b-9f5b-30b8da63fe8b','ba26cc07-0ec4-42e5-817d-472030a8491e',360000,'pickup_cash','cash_upi_offline','recorded','Remaining balance collected in person at pickup','2026-09-22T11:22:18.982Z','2026-09-22T11:22:18.982Z','ba26cc07-0ec4-42e5-817d-472030a8491e'),
('f0a10016-0000-4000-8000-000000000016','2aabdcef-ae66-4481-aff4-cbcce43b246c','platform','79906dbe-2b0d-400b-9f5b-30b8da63fe8b',200000,'deposit_refund','online','refunded','Auto refund after dispute window (24h)','2026-09-23T11:22:18.991Z','2026-09-23T11:22:18.991Z','system')
ON CONFLICT (id) DO NOTHING;

-- 2) invoices (2 — numbers preserved verbatim from booking.paid_online audits)
INSERT INTO payment.invoices (id, booking_id, number, amount_paise, kind, created_at, updated_at, created_by) VALUES
('f0a20001-0000-4000-8000-000000000001','9b6e38a0-6e7b-4f6b-a0ec-98196330d360','INV-1790075778932-750',290000,'booking_partial','2026-09-22T11:16:18.933Z','2026-09-22T11:16:18.933Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a20002-0000-4000-8000-000000000002','2aabdcef-ae66-4481-aff4-cbcce43b246c','INV-1790076138964-531',290000,'booking_partial','2026-09-22T11:22:18.965Z','2026-09-22T11:22:18.965Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b')
ON CONFLICT (id) DO NOTHING;

-- 3) refunds (5 = 2 cancellation rows + 3 auto deposit sweeps)
INSERT INTO payment.refunds (id, booking_id, transaction_id, amount_paise, reason, status, initiated_by, created_at, updated_at, created_by) VALUES
('f0a30001-0000-4000-8000-000000000001','c6200d60-4c43-40a0-821e-f024fee0f851','f0a10005-0000-4000-8000-000000000005',230000,'Cancellation (free)','processed','79906dbe-2b0d-400b-9f5b-30b8da63fe8b','2026-08-23T06:06:23.043Z','2026-08-23T06:06:23.043Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a30002-0000-4000-8000-000000000002','c6200d60-4c43-40a0-821e-f024fee0f851','f0a10006-0000-4000-8000-000000000006',200000,'Deposit released on cancellation (free)','processed','79906dbe-2b0d-400b-9f5b-30b8da63fe8b','2026-08-23T06:06:23.043Z','2026-08-23T06:06:23.043Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a30003-0000-4000-8000-000000000003','0315ba3a-5643-4dac-ae5f-76538ecb5629','f0a10002-0000-4000-8000-000000000002',200000,'Auto refund after dispute window (24h)','processed','system','2026-08-24T06:06:22.950Z','2026-08-24T06:06:22.950Z','system'),
('f0a30004-0000-4000-8000-000000000004','9b6e38a0-6e7b-4f6b-a0ec-98196330d360','f0a10010-0000-4000-8000-000000000010',200000,'Auto refund after dispute window (24h)','processed','system','2026-09-23T11:16:18.966Z','2026-09-23T11:16:18.966Z','system'),
('f0a30005-0000-4000-8000-000000000005','2aabdcef-ae66-4481-aff4-cbcce43b246c','f0a10014-0000-4000-8000-000000000014',200000,'Auto refund after dispute window (24h)','processed','system','2026-09-23T11:22:18.991Z','2026-09-23T11:22:18.991Z','system')
ON CONFLICT (id) DO NOTHING;

-- 4) reviews (3 — all renter -> owner, 5 stars; timestamps from review.created audits)
INSERT INTO booking.reviews (id, booking_id, reviewer_id, target_type, target_user_id, rating, comment, is_deleted, created_at, updated_at, created_by) VALUES
('f0a40001-0000-4000-8000-000000000001','0315ba3a-5643-4dac-ae5f-76538ecb5629','79906dbe-2b0d-400b-9f5b-30b8da63fe8b','owner','ba26cc07-0ec4-42e5-817d-472030a8491e',5,NULL,0,'2026-08-23T06:06:22.930Z','2026-08-23T06:06:22.930Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a40002-0000-4000-8000-000000000002','9b6e38a0-6e7b-4f6b-a0ec-98196330d360','79906dbe-2b0d-400b-9f5b-30b8da63fe8b','owner','ba26cc07-0ec4-42e5-817d-472030a8491e',5,NULL,0,'2026-09-22T11:16:18.983Z','2026-09-22T11:16:18.983Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b'),
('f0a40003-0000-4000-8000-000000000003','2aabdcef-ae66-4481-aff4-cbcce43b246c','79906dbe-2b0d-400b-9f5b-30b8da63fe8b','owner','ba26cc07-0ec4-42e5-817d-472030a8491e',5,NULL,0,'2026-09-22T11:22:19.003Z','2026-09-22T11:22:19.003Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b')
ON CONFLICT (id) DO NOTHING;

-- 5) trip extension (1 — end_date from booking.extended audit; daily rate 150000)
INSERT INTO booking.trip_extensions (id, booking_id, requested_end_date, additional_days, additional_amount_paise, status, decided_by, paid_at, created_at, updated_at, created_by) VALUES
('f0a50001-0000-4000-8000-000000000001','0315ba3a-5643-4dac-ae5f-76538ecb5629','2026-09-02T06:06:22.898Z',1,150000,'approved','ba26cc07-0ec4-42e5-817d-472030a8491e',NULL,'2026-08-23T06:06:22.915Z','2026-08-23T06:06:22.915Z','79906dbe-2b0d-400b-9f5b-30b8da63fe8b')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- verification (expected: transactions 16, invoices 2, refunds 5, reviews 3,
-- trip_extensions 1, bookings 4, users 11, wallet available 120000)
SELECT 'transactions' AS what, COUNT(*)::text FROM payment.transactions
UNION ALL SELECT 'invoices', COUNT(*)::text FROM payment.invoices
UNION ALL SELECT 'refunds', COUNT(*)::text FROM payment.refunds
UNION ALL SELECT 'reviews', COUNT(*)::text FROM booking.reviews
UNION ALL SELECT 'trip_extensions', COUNT(*)::text FROM booking.trip_extensions
UNION ALL SELECT 'bookings', COUNT(*)::text FROM booking.bookings
UNION ALL SELECT 'users', COUNT(*)::text FROM auth.users
UNION ALL SELECT 'owner_wallet_available', available_balance_paise::text FROM payment.wallets WHERE user_id='ba26cc07-0ec4-42e5-817d-472030a8491e';
