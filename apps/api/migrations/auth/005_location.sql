-- Map coordinates for a user's own location.
--
-- `city`/`state` (migration 004) answer "where are you roughly" for search and
-- filtering, but a map needs a point. Free-text city names cannot be rendered on
-- a map without resolving them every time, so coordinates are resolved once --
-- either by geocoding the city the user typed, or by the user dropping a pin --
-- and stored here.
--
-- Why store the resolved point instead of geocoding on read: Nominatim's public
-- endpoint allows about one request per second. Geocoding inside a page render
-- would put a third-party rate limit in the critical path of every car page, and
-- a slow or unreachable geocoder would take the page down with it. Resolve once,
-- at the moment the user tells us, and reads stay a plain column lookup.
--
-- Accuracy note: 'geocoded' points are a city centroid and can be tens of km off
-- the user's actual address; 'manual' points are wherever the user clicked. The
-- distinction is kept because it is the difference between an approximate hint
-- and a deliberate choice, and the portals label them differently.

-- DOUBLE PRECISION, not REAL. REAL is float4: ~7 significant decimal digits, so
-- a Mysuru pin stored as 12.3051828 comes back as 12.305182. That is about 11cm
-- of drift -- invisible on a map, but it silently corrupts the value and makes
-- two different pins compare unequal. float8 holds the full ~15 digits a GPS
-- fix has, so a pin survives a round trip byte-for-byte.
ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- How the coordinates were obtained. Null whenever there are no coordinates.
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_source TEXT
  CHECK (location_source IS NULL OR location_source IN ('geocoded', 'manual'));

-- A point is a pair. Rejecting a lone latitude or longitude here means no read
-- path has to wonder whether the missing half means "unset" or "unknown", and
-- the range check keeps a bad client payload from parking a marker in the ocean.
--
-- The IS NOT NULL tests are load-bearing, not belt-and-braces. In SQL, NULL
-- BETWEEN -180 AND 180 evaluates to NULL, not false, so without them a row with
-- a latitude and a NULL longitude makes the OR evaluate to NULL -- and a CHECK
-- constraint rejects only on FALSE, so the half-set row would sail through.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_location_pair_check;
ALTER TABLE users ADD CONSTRAINT users_location_pair_check CHECK (
  (latitude IS NULL AND longitude IS NULL AND location_source IS NULL)
  OR (
    latitude IS NOT NULL AND latitude BETWEEN -90 AND 90
    AND longitude IS NOT NULL AND longitude BETWEEN -180 AND 180
    AND location_source IS NOT NULL
  )
);

-- Proximity search ("cars near me") groups on latitude first, so a composite
-- index beats two single-column ones for that access pattern.
CREATE INDEX IF NOT EXISTS idx_users_location ON users (latitude, longitude);