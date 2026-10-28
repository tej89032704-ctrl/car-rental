import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { api } from './api.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Choose a map location: search for a city, or click the map to drop a pin.
 *
 * Two ways in, because neither alone is adequate. Typing a city is faster for
 * anyone who knows where they are, but the result is a city centroid that can be
 * tens of km off; clicking puts the pin where the user actually means. The
 * picker shows which one produced the current pin so the distinction survives
 * into the saved profile (migration 005's `location_source`).
 *
 * Leaflet rather than the static tiles LocationMap uses: picking a point is an
 * inherently interactive task, and a draggable, zoomable map is the only
 * reasonable way to do it. react-leaflet 4 is the React 18 line.
 *
 * Tiles are OpenStreetMap's public raster server with the required attribution.
 * `scrollWheelZoom` is off so the map does not swallow page scrolling, which is
 * the single most common complaint about an embedded map.
 */

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors';

/** India-wide fallback: the product only operates in India, so this is a sane default view. */
const DEFAULT_CENTER = [15.5, 78.5];
const DEFAULT_ZOOM = 5;

/** Closest a user can zoom. Street-level is enough to place a pickup pin. */
const MAX_PICK_ZOOM = 18;

/**
 * A CSS-drawn pin rather than Leaflet's bundled PNG marker.
 *
 * The default marker references its images by relative URL from inside
 * node_modules, which the dev server serves over /@fs/ with an absolute
 * filesystem path. That request fails, and the classic symptom is an invisible
 * or broken marker on a map that otherwise works perfectly -- confirmed here:
 * the pin was placed correctly but rendered as a dead image link.
 *
 * Copying the PNGs into the repo would fix one bundler but re-break on the next
 * asset-path change. A divIcon is styled from this project's own stylesheet, so
 * it has no asset to resolve and follows the theme's colours for free.
 */
const pinIcon = L.divIcon({
  className: 'location-pin-icon',
  // 12x21 matches Leaflet's own marker anchor so the point lands on the
  // coordinate rather than the icon's corner.
  iconSize: [12, 21],
  iconAnchor: [6, 21],
  popupAnchor: [0, -21],
  html: '<span class="location-pin-icon-dot"></span>',
});

/** Drops the pin wherever the user clicks. Leaflet needs a child of the map to listen. */
function ClickToPlace({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
  });
  return null;
}

/**
 * Moves the view when the pin's coordinates change.
 *
 * MapContainer reads `center` once, at creation, so a pin that arrives later --
 * the saved one loading in after /auth/me answers, or a city chosen from the
 * search -- is rendered on a map still looking at India, with the marker
 * somewhere off screen. That is the "pin point not showing" symptom: the
 * marker exists, the view never travelled to it.
 *
 * A click is the exception. The point is already under the cursor, so the
 * zoom is left alone instead of yanking a street-level view back to city level.
 */
function Recenter({ target, zoom }) {
  const map = useMap();
  const lat = target ? target[0] : null;
  const lng = target ? target[1] : null;
  // `zoom` is deliberately read at fire time rather than depended on: it only
  // ever changes alongside the coordinates.
  useEffect(() => {
    if (lat == null || lng == null) return;
    const here = map.getCenter();
    if (Math.abs(here.lat - lat) < 1e-6 && Math.abs(here.lng - lng) < 1e-6) return;
    const movedFar = Math.abs(here.lat - lat) > 0.05 || Math.abs(here.lng - lng) > 0.05;
    map.setView([lat, lng], movedFar ? zoom : Math.max(map.getZoom(), 13), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, lat, lng]);
  return null;
}

/**
 * One device fix, mounted only while one is in flight, so the browser's
 * permission prompt opens on the click rather than on page load. Found, denied
 * and unsupported all arrive here as a Leaflet event and leave through one
 * callback -- the caller turns a null into a plain-language note instead of a
 * button that silently does nothing.
 */
function Locate({ onFix }) {
  const map = useMap();
  // Held in a ref so a re-render of the picker does not restart the request.
  const fix = useRef(onFix);
  useEffect(() => { fix.current = onFix; });

  useEffect(() => {
    try {
      map.locate({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
        watch: false,
        setView: false,
      });
    } catch {
      fix.current(null);
    }
    return () => map.stopLocate();
  }, [map]);

  useMapEvents({
    locationfound(e) {
      map.stopLocate();
      fix.current({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
    locationerror() {
      map.stopLocate();
      fix.current(null);
    },
  });

  return null;
}

export default function LocationPicker({ value, onChange, city, className = '' }) {
  // value: { latitude, longitude } | null
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  // Device fix state. `locating` mounts <Locate/>, which is what actually asks
  // the browser -- the prompt belongs to the button press, not to the page.
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState('');
  const [pinZoom, setPinZoom] = useState(13);

  async function search(e) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setBusy(true);
    setNote('');
    try {
      // Through the shared api() helper rather than a bare fetch: the helper
      // attaches the bearer token and transparently refreshes an expired
      // session. A bare fetch omits the header, the API answers 401, and the
      // picker reports "search failed" for a user who is perfectly logged in.
      const body = await api(`/geo/search?q=${encodeURIComponent(q)}`);
      if (body.throttled) {
        setResults([]);
        setNote('One search at a time — try again in a moment.');
      } else if (body.unavailable) {
        setResults([]);
        setNote('Location lookup is unavailable. You can still drop a pin on the map.');
      } else if (!body.results.length) {
        setResults([]);
        setNote(`No match for "${q}". Try a different spelling, or click the map.`);
      } else {
        setResults(body.results);
        setNote('');
      }
    } catch {
      setResults([]);
      setNote('Could not reach the server. You can still drop a pin on the map.');
    } finally {
      setBusy(false);
    }
  }

  function pick(hit) {
    setPinZoom(13);
    onChange({ latitude: hit.latitude, longitude: hit.longitude, source: 'geocoded' });
    setResults([]);
    setQuery('');
  }

  function useMyLocation() {
    setLocNote('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocNote('This browser cannot share a location. Drop a pin on the map instead.');
      return;
    }
    setResults([]);
    setLocating(true);
  }

  // The device answers into the same slot as a dropped pin, so the address
  // boxes fill from it exactly as they would from a click -- and it is stored
  // as a deliberate point, the same as one the user placed by hand.
  function applyFix(next) {
    setLocating(false);
    if (!next) {
      setLocNote('Location unavailable. Allow access for this site, or drop a pin on the map.');
      return;
    }
    setPinZoom(16);
    onChange({ ...next, source: 'manual' });
  }

  const marker = value ? [value.latitude, value.longitude] : null;

  return (
    <div className={`location-picker ${className}`}>
      {/* A div, not a form. The picker sits inside the profile form on the
          account pages, and a form inside a form is invalid HTML -- React warns
          about it and browsers respond unpredictably. The button is still
          type="button" calling search directly, because as a submit button it
          fell back to a native GET navigation when the handler was not in play,
          which reloads the page and throws the typed query away -- observed as
          the URL silently becoming "profile-details?". Enter is handled on the
          input itself, which is the part of form semantics anyone used. */}
      <div className="location-search" role="search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            search(e);
          }}
          placeholder="Search your city"
          aria-label="Search your city"
        />
        <button type="button" className="btn btn-secondary" onClick={search} disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
        <button
          type="button"
          className="btn btn-secondary sec locate"
          onClick={useMyLocation}
          disabled={locating}
          aria-label="Use my current location"
          title="Use my current location"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="7" />
            <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />
          </svg>
          {locating ? 'Locating…' : 'Use my location'}
        </button>
      </div>

      {note && <p className="location-picker-note">{note}</p>}
      {locNote && <p className="location-picker-note" role="status">{locNote}</p>}

      {results.length > 0 && (
        <ul className="location-results">
          {results.map((hit, i) => (
            <li key={`${hit.latitude},${hit.longitude},${i}`}>
              <button type="button" onClick={() => pick(hit)}>{hit.label}</button>
            </li>
          ))}
        </ul>
      )}

      <div className="location-picker-map">
        <MapContainer
          center={marker ?? DEFAULT_CENTER}
          zoom={marker ? 13 : DEFAULT_ZOOM}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={MAX_PICK_ZOOM} />
          <ClickToPlace
            onPick={(latlng) => {
              setPinZoom(13);
              onChange({ ...latlng, source: 'manual' });
            }}
          />
          <Recenter target={marker} zoom={pinZoom} />
          {locating && <Locate onFix={applyFix} />}
          {marker && <Marker position={marker} icon={pinIcon} />}
        </MapContainer>
      </div>

      <p className="location-picker-hint">
        {marker
          ? `Pin set at ${marker[0].toFixed(4)}, ${marker[1].toFixed(4)}. Click the map to move it.`
          : 'Click the map to drop your pin, or search for your city above.'}
        {city ? ` (${city})` : ''}
      </p>
    </div>
  );
}