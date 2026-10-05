import { useEffect, useState } from 'react';

/**
 * Read-only map showing where a user is.
 *
 * Deliberately not Leaflet/Google Maps: a static map image needs no library, no
 * bundler plugin and no tile-attribution handling, and it cannot be dragged,
 * zoomed or blocked by a third-party script. The portal has exactly one job here
 * -- "the owner is around here" -- which an image answers completely.
 *
 * Tiles come from OpenStreetMap's public raster server, so the tile URL and the
 * required attribution both belong here rather than being buried in a map
 * library. Zoom is capped at 16: the free tile policy caps practical use well
 * below street level, and a higher zoom on the standard tile server returns
 * nothing.
 *
 * `latitude`/`longitude` are the owner's stored coordinates. They are passed
 * through exactly as given -- see FleetService.publicOwner for why they are
 * exact rather than rounded.
 */

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors';
const MAX_ZOOM = 16;

/**
 * A slippy-map tile coordinate is a fraction of the world at that zoom, so a
 * centre point plus an integer zoom has to be turned back into an x/y tile
 * index to build the tile grid.
 */
function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}

function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z),
  );
}

function hasCoords(lat, lng) {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

/**
 * Pin colour tracks how the point was obtained -- see migration 005.
 *
 * Not `var(--brand)`: that token is near-black in every portal's palette, and
 * against a photographic map tile a black pin reads as a shadow. An approximate
 * (geocoded) point is deliberately muted, and an exact dropped pin is the only
 * thing on the page wearing the project's one accent colour, so the two are
 * distinguishable at a glance rather than only by the caption below.
 */
function markerFor(source) {
  return source === 'geocoded' ? '#1d1d1f' : '#e8590c';
}

export default function LocationMap({ latitude, longitude, source, city, className = '' }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Reset when the target moves: a previous failure belongs to the old pin and
  // must not suppress the new one.
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [latitude, longitude]);

  if (!hasCoords(latitude, longitude)) {
    return (
      <div className={`location-map location-map-empty ${className}`}>
        <span>
          {city ? `${city} — no map pin yet` : 'No map pin yet'}
        </span>
      </div>
    );
  }

  // One tile is enough at high zoom; two by two keeps the grid filled when the
  // pin sits near a tile edge, where a single tile would leave a blank quadrant.
  const z = MAX_ZOOM;
  const cx = lonToTileX(longitude, z);
  const cy = latToTileY(latitude, z);
  const size = 256;
  const cells = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      cells.push({ x: cx + dx, y: cy + dy, key: `${cx + dx}/${cy + dy}` });
    }
  }

  // Pixel offset of the pin within the centre tile, so it sits on the exact
  // coordinate instead of the tile corner. The centre tile is drawn at 0,0 in
  // the grid (see the tile style above), so the fractions map straight across.
  const fracX = (longitude + 180) / 360 * Math.pow(2, z) - cx;
  const fracY = (1 - Math.log(Math.tan((latitude * Math.PI) / 180) + 1 / Math.cos((latitude * Math.PI) / 180)) / Math.PI) / 2 * Math.pow(2, z) - cy;
  const pinLeft = fracX * size;
  const pinTop = fracY * size;

  return (
    <div className={`location-map ${className}`}>
      {/* The grid is sized in CSS, not inline: an inline width outranks the
          stylesheet, and the grid has to be viewport-relative while the tile
          offsets below stay in absolute pixels. */}
      <div className="location-map-grid">
        {cells.map((c) => (
          <img
            key={c.key}
            className="location-map-tile"
            src={TILE_URL.replace('{z}', String(z)).replace('{x}', String(c.x)).replace('{y}', String(c.y))}
            style={{ left: (c.x - cx) * size, top: (c.y - cy) * size }}
            width={size}
            height={size}
            alt=""
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        ))}
        <span
          className="location-map-pin"
          style={{ left: pinLeft, top: pinTop, background: markerFor(source) }}
          aria-hidden="true"
        />
      </div>

      {!loaded && !failed && <span className="location-map-status">Loading map…</span>}
      {failed && (
        <span className="location-map-status location-map-failed">
          Map unavailable
          {city ? ` — ${city}` : ''}
        </span>
      )}

      <div className="location-map-meta">
        <span className="location-map-place">{city || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}</span>
        {source === 'geocoded' && (
          // A city centroid is not an address, and saying so prevents a renter
          // from reading a geocoded point as a precise pickup spot.
          <span className="location-map-source" title="Resolved from the city on the profile, so it may be several km from the exact address">
            Approximate
          </span>
        )}
        <a className="location-map-attrib" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          {TILE_ATTRIBUTION}
        </a>
      </div>
    </div>
  );
}