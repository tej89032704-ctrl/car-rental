/**
 * Owner summary card, shared by the portals that show a car to a renter.
 *
 * Consumes exactly the public-safe `owner` block that GET /cars/:id returns
 * (see FleetService.publicOwner): name, coarse location, member since,
 * verification, rating, cars listed. It never receives contact details, so
 * there is nothing here to leak — the trust decision is made entirely on the
 * server's allowlist, not on what this component chooses not to render.
 *
 * Location is omitted when unset rather than rendered blank, and the rating
 * row disappears when there are no reviews, because "no reviews yet" and
 * "0 stars" are different facts.
 */
function memberSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function OwnerCard({ owner, className = '' }) {
  if (!owner) return null;

  const since = memberSince(owner.member_since);
  const place = [owner.city, owner.state].filter(Boolean).join(', ');
  const hasRating = owner.review_count > 0 && owner.rating != null;

  return (
    <div className={`owner-card ${className}`}>
      <div className="owner-card-head">
        <div className="owner-avatar" aria-hidden="true">
          {owner.name?.[0] || '?'}
        </div>
        <div className="owner-card-id">
          <div className="owner-name">
            {owner.name || 'Owner'}
            {owner.verified && (
              <span className="pill active owner-verified" title="Identity and documents verified">
                Verified ✓
              </span>
            )}
          </div>
          <div className="owner-meta">
            {place && <span className="owner-place">{place}</span>}
            {since && <span>Member since {since}</span>}
          </div>
        </div>
      </div>

      <dl className="owner-stats">
        {hasRating && (
          <div className="owner-stat">
            <dt>Rating</dt>
            <dd>
              ★ {owner.rating}
              <span className="owner-stat-count">
                {' '}
                ({owner.review_count} review{owner.review_count !== 1 ? 's' : ''})
              </span>
            </dd>
          </div>
        )}
        <div className="owner-stat">
          <dt>Cars listed</dt>
          <dd>{owner.cars_listed ?? 0}</dd>
        </div>
      </dl>

      {!owner.verified && (
        <p className="owner-note">
          This owner has not completed verification. {owner.name || 'The owner'} can still
          respond to booking requests.
        </p>
      )}
    </div>
  );
}
