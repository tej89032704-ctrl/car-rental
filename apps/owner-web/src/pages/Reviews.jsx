import { useEffect, useState } from 'react';
import { useData } from '../data.jsx';
import { avatarBg, relTime } from '../lib.js';

/**
 * My Reviews — reviews written about the owner (/reviews/about-me), already
 * loaded by the data provider, so this page never fetches. The reply box has
 * no endpoint behind it, so replies live in localStorage keyed per review.
 */

const stars = (n) => {
  const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return <span className="st">{'★'.repeat(v)}{'☆'.repeat(5 - v)}</span>;
};

const replyKey = (id) => `oh-review-reply-${id}`;

export default function Reviews() {
  const { about, errors } = useData();
  const [replies, setReplies] = useState({});
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState('');

  // Replies are per-device, so re-read them whenever the review list changes.
  useEffect(() => {
    const next = {};
    for (const r of (about && about.reviews) || []) {
      try {
        const v = localStorage.getItem(replyKey(r.id));
        if (v) next[r.id] = v;
      } catch { /* private mode */ }
    }
    setReplies(next);
  }, [about]);

  function openReply(r) {
    setOpenId(r.id);
    setDraft(replies[r.id] || '');
  }

  function saveReply(id) {
    const text = draft.trim();
    if (!text) return;
    try { localStorage.setItem(replyKey(id), text); } catch { /* private mode */ }
    setReplies((m) => ({ ...m, [id]: text }));
    setDraft('');
    setOpenId(null);
  }

  // The provider seeds a zeroed fallback on failure, but errors.about means
  // that zero is fake — show the failure alone rather than an empty page.
  if (errors && errors.about) return <div className="alert err">{errors.about}</div>;

  if (!about) {
    return (
      <>
        <div className="hd"><div><p className="ey">Renter feedback</p><h2>My <em>Reviews</em></h2></div></div>
        <div className="sk" /><div className="sk" /><div className="sk" />
      </>
    );
  }

  const reviews = Array.isArray(about.reviews) ? about.reviews : [];
  const total = Number(about.total_reviews) || 0;
  const avg = Number(about.avg_rating) || 0;

  if (total === 0) {
    return (
      <>
        <div className="hd"><div><p className="ey">Renter feedback</p><h2>My <em>Reviews</em></h2></div></div>
        <div className="empty-state-section">
          <div className="empty-icon">★</div>
          <p>No reviews yet — ratings from finished trips will appear here.</p>
        </div>
      </>
    );
  }

  // Distribution denominator is the rows we actually have; total_reviews can
  // outrun the array if the API ever pages it.
  const denom = reviews.length || 1;
  const dist = [5, 4, 3, 2, 1].map((n) => ({
    n,
    count: reviews.filter((r) => Math.round(Number(r.rating) || 0) === n).length,
  }));

  return (
    <>
      <div className="hd">
        <div>
          <p className="ey">Renter feedback</p>
          <h2>My <em>Reviews</em></h2>
          <p>What renters said after their trips.</p>
        </div>
      </div>

      <div className="g2">
        {/* Score card: the big average reads first, the bars explain it. */}
        <div className="c sc">
          <div className="big">{avg.toFixed(1)}</div>
          {stars(avg)}
          <p className="mt">Based on {total} review{total === 1 ? '' : 's'}</p>
          <div style={{ marginTop: 18 }}>
            {dist.map((d) => (
              <div className="bar" key={d.n}>
                <span>{d.n}★</span>
                <i><s style={{ width: `${Math.round((d.count / denom) * 100)}%` }} /></i>
                <span>{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          {reviews.map((r) => (
            <div className="c rv" key={r.id}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span className="av" style={{ background: avatarBg(r.reviewer_name) }}>
                  {String(r.reviewer_name || '?')[0].toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b>{r.reviewer_name}</b>
                  {r.car && <span className="tag a">{r.car.brand} {r.car.model}</span>}
                </div>
                <em className="dl">{relTime(r.created_at)}</em>
              </div>

              {stars(r.rating)}
              {r.comment && <p>{r.comment}</p>}

              {replies[r.id] && (
                <p className="mt" style={{ fontSize: 13 }}>Your reply: {replies[r.id]}</p>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="o" style={{ fontSize: 13, padding: '7px 16px' }}
                  onClick={() => (openId === r.id ? setOpenId(null) : openReply(r))}>
                  Reply
                </button>
              </div>

              {openId === r.id && (
                <>
                  <div className="cin">
                    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveReply(r.id); }}
                      placeholder="Write a reply…" aria-label="Reply" />
                    <button className="b" disabled={!draft.trim()} onClick={() => saveReply(r.id)}>Send</button>
                  </div>
                  <p className="mt" style={{ fontSize: 12, marginTop: 6 }}>
                    Replies are stored on this device — there is no replies API yet.
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
