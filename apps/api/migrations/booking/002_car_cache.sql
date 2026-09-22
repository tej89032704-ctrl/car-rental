-- Denormalized cache of fleet cars used by the booking module.
-- Kept in sync from the fleet DB by FleetService.syncCarCache()
-- (app-layer sync, never a raw cross-db join in this module).
CREATE TABLE IF NOT EXISTS car_cache (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  plate TEXT NOT NULL,
  category TEXT,
  price_paise_per_day INTEGER NOT NULL DEFAULT 0,
  security_deposit_paise INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL,
  is_available INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_car_cache_owner ON car_cache(owner_id);
CREATE INDEX IF NOT EXISTS idx_car_cache_status ON car_cache(status);