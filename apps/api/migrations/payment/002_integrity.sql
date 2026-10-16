ALTER TABLE transactions ADD CONSTRAINT transaction_amount_valid CHECK (amount_paise >= 0) NOT VALID;
ALTER TABLE payouts ADD CONSTRAINT payout_amount_valid CHECK (amount_paise > 0) NOT VALID;
ALTER TABLE refunds ADD CONSTRAINT refund_amount_valid CHECK (amount_paise >= 0) NOT VALID;
ALTER TABLE refunds ADD CONSTRAINT refund_transaction_fk FOREIGN KEY (transaction_id) REFERENCES transactions(id) NOT VALID;
CREATE INDEX idx_transactions_payer ON transactions(payer_id, created_at DESC);
