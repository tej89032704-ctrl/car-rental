ALTER TABLE car_pricing ADD CONSTRAINT pricing_amounts_valid CHECK (daily_rate_paise > 0 AND security_deposit_paise >= 0 AND (weekly_rate_paise IS NULL OR weekly_rate_paise > 0) AND (monthly_rate_paise IS NULL OR monthly_rate_paise > 0)) NOT VALID;
ALTER TABLE car_pricing ADD CONSTRAINT pricing_car_fk FOREIGN KEY (car_id) REFERENCES cars(id) NOT VALID;
ALTER TABLE car_photos ADD CONSTRAINT photos_car_fk FOREIGN KEY (car_id) REFERENCES cars(id) NOT VALID;
ALTER TABLE car_documents ADD CONSTRAINT documents_car_fk FOREIGN KEY (car_id) REFERENCES cars(id) NOT VALID;
ALTER TABLE car_availability ADD CONSTRAINT availability_car_fk FOREIGN KEY (car_id) REFERENCES cars(id) NOT VALID;
ALTER TABLE cars ADD CONSTRAINT car_seats_valid CHECK (seats BETWEEN 1 AND 50) NOT VALID;
