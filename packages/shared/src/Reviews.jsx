/**
 * Shared review display pieces so every portal renders ratings the same way:
 *
 *  - `Stars`          — read-only star glyphs for a 1–5 value
 *  - `RatingSummary`  — "★ 4.8 (12 reviews)" line (or a friendly empty state)
 *  - `ReviewComments` — the comment cards (reviewer, stars, text, date)
 *
 * Used by: renter Search/CarDetail (car ratings), owner Requests (renter rating
 * shown when a request arrives).
 */

export function Stars({ value = 0 }) {
  const v = Math.round(Math.max(0, Math.min(5, Number(value) || 0)));
  return (
    <span className="stars" title={`${v} of 5`}>
      <span className="stars-on">{'★'.repeat(v)}</span>
      <span className="stars-off">{'☆'.repeat(5 - v)}</span>
    </span>
  );
}

export function RatingSummary({ avg = 0, count = 0, emptyText = 'No reviews yet' }) {
  if (!count) return <span className="rating-inline muted">★ {emptyText}</span>;
  return (
    <span className="rating-inline">
      <b>★ {Number(avg).toFixed(1)}</b>{' '}
      <Stars value={avg} />{' '}
      <span className="count">
        {count} review{count !== 1 ? 's' : ''}
      </span>
    </span>
  );
}

export function ReviewComments({ comments = [] }) {
  if (!comments?.length) return null;
  return (
    <div className="review-list">
      {comments.map((c, i) => (
        <div className="review-card" key={i}>
          <div className="review-card-header">
            <span className="review-card-name">{c.reviewer_name}</span>
            <span className="rating">
              <Stars value={c.rating} />
            </span>
          </div>
          {c.comment && <p className="review-card-comment">{c.comment}</p>}
          {c.created_at && (
            <p className="review-card-date">{new Date(c.created_at).toLocaleDateString()}</p>
          )}
        </div>
      ))}
    </div>
  );
}
