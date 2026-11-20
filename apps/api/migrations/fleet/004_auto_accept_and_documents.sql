-- Per-car booking settings, plus the wider set of documents an owner can attach.
--
-- `auto_accept` is the owner's standing instruction to skip manual approval: a
-- booking request for a car with this set is created already confirmed, which is
-- exactly the state the owner's Approve button leaves it in -- including the
-- renter being told to pay the 20%. Off by default, so every existing listing
-- keeps its current behaviour until its owner turns the switch on.
ALTER TABLE cars ADD COLUMN IF NOT EXISTS auto_accept INTEGER NOT NULL DEFAULT 0;

-- PUC, fitness and permit sit beside the RC book and insurance. The original
-- CHECK was declared inline on the column, so Postgres named it
-- car_documents_doc_type_check; it has to go before the wider one can be added.
ALTER TABLE car_documents DROP CONSTRAINT IF EXISTS car_documents_doc_type_check;
ALTER TABLE car_documents ADD CONSTRAINT car_documents_doc_type_check
  CHECK (doc_type IN ('rc_book','insurance','puc','fitness','permit'));
