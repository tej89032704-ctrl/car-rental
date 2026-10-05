import { useEffect, useMemo, useState } from 'react';

/**
 * Car photo gallery, shared by the portals that show a single car.
 *
 * Three data realities drove the design here, all of them present in the real
 * database rather than hypothetical:
 *
 * 1. Cars have anywhere from 0 to N photos. One car in the seed data has the
 *    same image attached four times, and another has none at all. Duplicates
 *    are collapsed so the strip is not four identical tiles, and a car with
 *    no photos falls back to a placeholder rather than a broken <img>.
 * 2. Photos arrive as `{ id, file_url, sort_order }` from car_photos. Dedup is
 *    on file_url, not id, because the duplicate rows have distinct ids.
 * 3. The list can change under the viewer (the owner deletes a photo), so the
 *    selected index is clamped instead of trusted.
 *
 * The class names are styled per portal, following the convention the other
 * shared components use -- no CSS is imported from here.
 */
export default function CarGallery({ photos = [], make, model, className = '' }) {
  // Collapse repeats but keep the owner's ordering: the first occurrence wins,
  // so the intended cover photo stays the cover photo.
  const list = useMemo(() => {
    const seen = new Set();
    return photos.filter((p) => {
      if (!p?.file_url || seen.has(p.file_url)) return false;
      seen.add(p.file_url);
      return true;
    });
  }, [photos]);

  const [active, setActive] = useState(0);

  // Clamp rather than reset: dropping the last photo should show the new last
  // photo, not blank the gallery.
  useEffect(() => {
    if (active > list.length - 1) setActive(Math.max(0, list.length - 1));
  }, [list.length, active]);

  if (!list.length) {
    return (
      <div className={`car-gallery ${className}`}>
        <div className="car-gallery-main car-gallery-empty">
          <span className="car-gallery-empty-text">No photos yet</span>
        </div>
      </div>
    );
  }

  const current = list[Math.min(active, list.length - 1)];
  const alt = `${make || ''} ${model || ''}`.trim() || 'Car';

  function step(delta) {
    setActive((i) => (i + delta + list.length) % list.length);
  }

  return (
    <div className={`car-gallery ${className}`}>
      <div className="car-gallery-main">
        <img
          className="car-gallery-img"
          src={current.file_url}
          alt={`${alt} — photo ${Math.min(active, list.length - 1) + 1} of ${list.length}`}
        />

        {list.length > 1 && (
          <>
            <button type="button" className="car-gallery-nav car-gallery-prev" onClick={() => step(-1)} aria-label="Previous photo">
              &#8249;
            </button>
            <button type="button" className="car-gallery-nav car-gallery-next" onClick={() => step(1)} aria-label="Next photo">
              &#8250;
            </button>
            <span className="car-gallery-count">
              {Math.min(active, list.length - 1) + 1} / {list.length}
            </span>
          </>
        )}
      </div>

      {list.length > 1 && (
        <div className="car-gallery-thumbs" role="tablist" aria-label={`${alt} photos`}>
          {list.map((p, i) => (
            <button
              key={p.id || p.file_url}
              type="button"
              role="tab"
              aria-selected={i === Math.min(active, list.length - 1)}
              aria-label={`Photo ${i + 1}`}
              className={`car-gallery-thumb ${i === Math.min(active, list.length - 1) ? 'active' : ''}`}
              onClick={() => setActive(i)}
            >
              <img src={p.file_url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
