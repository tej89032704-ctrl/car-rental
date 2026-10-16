import { useState } from 'react';
import { api } from '../api.js';
import { useData, useRequestRows } from '../data.jsx';
import { avatarBg, dayCount, inrP, rangeLabel } from '../lib.js';
import { useOverlay, useToast } from '../ui.jsx';

/**
 * Booking requests: the reference's Pending / Approved / Declined tabs and
 * row cards, plus the three things this portal already did that the reference
 * did not -- rating a finished trip, raising a dispute, and deciding a renter's
 * date extension. Those hang off the same rows as inline panels rather than
 * separate pages, so the tab rhythm stays intact.
 *
 * Rows are read from useRequestRows() and looked up by id, so a decision made
 * inside the drawer re-renders the row here against fresh server state.
 */

const TABS = [['p', 'Pending'], ['a', 'Approved'], ['d', 'Declined']];

const STATUS_LABEL = {
  requested: 'Pending',
  pending: 'Pending',
  confirmed: 'Confirmed',
  ongoing: 'On trip',
  completed: 'Completed',
  rejected: 'Declined',
  cancelled: 'Cancelled',
};

const canReview = (r) => r.status === 'completed' && r.has_reviewed === false;
const canDispute = (r) => ['confirmed', 'ongoing'].includes(r.status);

export default function Requests() {
  const rows = useRequestRows();
  const { extensions, errors, reload } = useData();
  const open = useOverlay().open;
  const toast = useToast();

  const [tab, setTab] = useState('p');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [panel, setPanel] = useState(null); // { kind: 'review' | 'dispute', id }
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [extBusy, setExtBusy] = useState('');

  const counts = { p: 0, a: 0, d: 0 };
  rows.forEach((r) => { if (counts[r.tab] !== undefined) counts[r.tab] += 1; });
  const shown = rows.filter((r) => r.tab === tab);

  const activeExts = ((extensions || []).filter(
    (x) => x.status && !['approved', 'rejected', 'declined', 'cancelled'].includes(x.status),
  ));

  function openPanel(kind, id) {
    setPanel({ kind, id });
    setRating(5);
    setComment('');
    setReason('');
    setErr('');
  }

  async function run(key, fn, message) {
    setBusy(key);
    setErr('');
    try {
      await fn();
      await reload();
      toast(message);
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    } finally {
      setBusy('');
    }
  }

  const decide = (id, decision) => run(
    id + decision,
    () => api(`/bookings/${id}/decide`, { method: 'POST', body: { decision } }),
    decision === 'approve' ? 'Booking approved' : 'Request declined',
  );

  async function submitReview(r) {
    const ok = await run(
      `rev:${r.id}`,
      () => api('/reviews/renter', {
        method: 'POST',
        body: { booking_id: r.id, rating, comment: comment.trim() || undefined },
      }),
      'Review submitted',
    );
    if (ok) setPanel(null);
  }

  async function submitDispute(r) {
    // The API rejects reasons shorter than 5 characters, so mirror that here
    // instead of letting the round trip fail after the user has typed.
    if (reason.trim().length < 5) {
      setErr('Tell us a little more — at least 5 characters.');
      return;
    }
    const ok = await run(
      `disp:${r.id}`,
      () => api('/disputes', { method: 'POST', body: { booking_id: r.id, reason: reason.trim() } }),
      'Dispute raised',
    );
    if (ok) setPanel(null);
  }

  async function decideExt(id, decision) {
    setExtBusy(id + decision);
    setErr('');
    try {
      await api(`/extensions/${id}/decide`, { method: 'POST', body: { decision } });
      await reload();
      toast(decision === 'approve' ? 'Extension approved' : 'Extension declined');
    } catch (e) {
      setErr(e.message);
    } finally {
      setExtBusy('');
    }
  }

  if (errors.requests) {
    return (
      <div className="wrap">
        <div className="alert err">{errors.requests}</div>
        <button className="b" onClick={() => reload()}>Retry</button>
      </div>
    );
  }

  return (
    <>
      <div className="hd">
        <div>
          <div className="ey">Queue</div>
          <h2>Booking <em>requests</em></h2>
          <p>{counts.p} waiting on you · {rows.length} in total</p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setPanel(null); }}>
            {label} <em>{counts[k]}</em>
          </button>
        ))}
      </div>

      {err && <div className="alert err">{err}</div>}

      {shown.length === 0 && (
        <div className="empty-state-section">
          <div className="empty-icon">📅</div>
          <p>
            {tab === 'p' && 'No requests waiting for a decision.'}
            {tab === 'a' && 'Nothing approved yet — approved trips land here.'}
            {tab === 'd' && 'Nothing declined.'}
          </p>
        </div>
      )}

      {shown.map((r) => {
        const name = r.renter?.name || 'Renter';
        const days = dayCount(r.start_date, r.end_date);
        const label = STATUS_LABEL[r.status] || r.status;
        const reviewing = panel?.kind === 'review' && panel.id === r.id;
        const disputing = panel?.kind === 'dispute' && panel.id === r.id;

        return (
          <div key={r.id}>
            <div
              className="rq c"
              data-x="req"
              role="button"
              tabIndex={0}
              onClick={() => open('req', r.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') open('req', r.id); }}
            >
              <span className="av" style={{ background: avatarBg(name) }}>{name[0].toUpperCase()}</span>
              <div className="m">
                <b>{name}</b>
                <span className="vf">
                  {r.renter?.avg_rating
                    ? `★ ${Number(r.renter.avg_rating).toFixed(1)} · ${r.renter.total_reviews || 0} reviews`
                    : 'New renter'}
                </span>
                <div className="mt">
                  {r.car?.brand} {r.car?.model} · {rangeLabel(r.start_date, r.end_date)} · {days} day{days === 1 ? '' : 's'}
                </div>
              </div>
              <div className="am">
                {inrP(r.total_amount_paise)}
                <small>{days} day{days === 1 ? '' : 's'}</small>
              </div>
              {/* Stopping propagation here keeps a decision click from opening
                  the drawer that the row itself is bound to. */}
              <div className="ac" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                {r.tab === 'p' && (
                  <>
                    <button className="o r" disabled={!!busy} onClick={() => decide(r.id, 'reject')}>Decline</button>
                    <button className="b" disabled={!!busy} onClick={() => decide(r.id, 'approve')}>Approve</button>
                  </>
                )}
                {r.tab === 'a' && (
                  <>
                    {canDispute(r) && (
                      <button className="o r"
                        onClick={() => (disputing ? setPanel(null) : openPanel('dispute', r.id))}>
                        {disputing ? 'Cancel' : 'Raise dispute'}
                      </button>
                    )}
                    {canReview(r) && (
                      <button className="o g"
                        onClick={() => (reviewing ? setPanel(null) : openPanel('review', r.id))}>
                        {reviewing ? 'Cancel' : 'Leave a review'}
                      </button>
                    )}
                    <span className="tag a">{label}</span>
                  </>
                )}
                {r.tab === 'd' && <span className="tag d">{label}</span>}
              </div>
            </div>

            {reviewing && (
              <div className="card" onClick={(e) => e.stopPropagation()}>
                <p className="ey">Rate {name}</p>
                <div className="star-rating" style={{ marginBottom: 12 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" className={n <= rating ? 'filled' : ''}
                      onClick={() => setRating(n)} aria-label={`${n} of 5`}>★</button>
                  ))}
                </div>
                <textarea className="f" rows={3} value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="How was the trip?" />
                <div className="card-footer-row">
                  <span className="muted">{r.car?.brand} {r.car?.model}</span>
                  <span>
                    <button className="btn sec sm" onClick={() => setPanel(null)}>Cancel</button>
                    <button className="b ml-8" disabled={!!busy}
                      onClick={() => submitReview(r)}>
                      {busy === `rev:${r.id}` ? 'Submitting…' : 'Submit'}
                    </button>
                  </span>
                </div>
              </div>
            )}

            {disputing && (
              <div className="card" onClick={(e) => e.stopPropagation()}>
                <p className="ey">Raise a dispute</p>
                <textarea className="f" rows={3} value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="What went wrong on this booking?" />
                <div className="card-footer-row">
                  <span className="muted">An admin will review it.</span>
                  <span>
                    <button className="btn sec sm" onClick={() => setPanel(null)}>Cancel</button>
                    <button className="b ml-8" disabled={!!busy}
                      onClick={() => submitDispute(r)}>
                      {busy === `disp:${r.id}` ? 'Raising…' : 'Raise dispute'}
                    </button>
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {tab === 'p' && activeExts.length > 0 && (
        <>
          <div className="page-section-title">Extension requests</div>
          {activeExts.map((x) => {
            const carName = typeof x.car === 'string'
              ? x.car
              : `${x.car?.brand || ''} ${x.car?.model || ''}`.trim() || 'Your car';
            return (
              <div className="rq c" key={x.id}>
                <span className="av" style={{ background: avatarBg(carName) }}>
                  {(carName[0] || 'E').toUpperCase()}
                </span>
                <div className="m">
                  <b>Extend by {x.additional_days} day{x.additional_days === 1 ? '' : 's'}</b>
                  <span className="vf" style={{ color: 'var(--mut)' }}>Renter asked for more time</span>
                  <div className="mt">
                    {carName} · now ends {String(x.requested_end_date || '').slice(0, 10)}
                  </div>
                </div>
                <div className="am">
                  {inrP(x.additional_amount_paise)}
                  <small>extra</small>
                </div>
                <div className="ac" onClick={(e) => e.stopPropagation()}>
                  <button className="o r" disabled={!!extBusy}
                    onClick={() => decideExt(x.id, 'reject')}>Decline</button>
                  <button className="b" disabled={!!extBusy}
                    onClick={() => decideExt(x.id, 'approve')}>Approve</button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
