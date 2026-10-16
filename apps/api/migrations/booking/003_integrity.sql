ALTER TABLE bookings ADD CONSTRAINT booking_dates_valid CHECK (end_date::timestamptz > start_date::timestamptz) NOT VALID;
ALTER TABLE bookings ADD CONSTRAINT booking_amounts_valid CHECK (total_amount_paise >= 0 AND online_paid_paise >= 0 AND remaining_due_paise >= 0 AND security_deposit_paise >= 0 AND late_fee_paise >= 0) NOT VALID;
ALTER TABLE booking_status_history ADD CONSTRAINT history_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) NOT VALID;
ALTER TABLE trip_extensions ADD CONSTRAINT extension_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) NOT VALID;
ALTER TABLE disputes ADD CONSTRAINT dispute_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) NOT VALID;
ALTER TABLE reviews ADD CONSTRAINT review_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) NOT VALID;
CREATE INDEX idx_booking_car_dates ON bookings(car_id, start_date, end_date) WHERE is_deleted = 0 AND status IN ('confirmed','ongoing');
