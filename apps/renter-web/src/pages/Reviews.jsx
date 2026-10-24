import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import CarArt from '../components/CarArt.jsx';
import { carTitle, day, paintFor, toast, tripRange, uprightFor } from '../components/ui.js';

function Stars({ value = 0, onPick }) {
  return (
    <div className="ce-stars">
      {[1, 2, 3, 4, 5].map((n) => (
        onPick ? (
          <button
            key={n}
            type="button"
            className={n <= value ? 'on' : ''}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => onPick(n)}
          >
            ★
          </button>
        ) : (
          <span key={n} className={n <= value ? 'on' : ''}>★</span>
        )
      ))}
    </div>
  );
}

export default function Reviews() {
  const [bookings, setBookings] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState('');

  async function load() {
    try {
      const [b, r] = await Promise.all([api('/bookings/my'), api('/reviews/my')]);
      setBookings(Array.isArray(b) ? b : []);
      setMine(Array.isArray(r) ? r : []);
      setErr('');
    } catch (e) {
      setErr(e.message || 'Could not load your reviews');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const waiting = bookings.filter((b) => b.status === 'completed' && !b.has_reviewed);

  /* A review can target the car or its owner, and both rows describe the same
     trip. Keep one row per booking, preferring the car target when the renter
     rated both — the trip is what the page is about. */
  const reviewed = Object.values(mine.reduce((acc, r) => {
    const key = r.booking_id || r.id;
    if (!acc[key] || (acc[key].target_type !== 'car' && r.target_type === 'car')) acc[key] = r;
    return acc;
  }, {}));

  async function rate(booking, n) {
    setPicked((p) => ({ ...p, [booking.id]: n }));
    setBusy(booking.id);
    try {
      await api('/reviews', { method: 'POST', body: { booking_id: booking.id, rating: n } });
      toast('Thanks for your review');
      await load();
    } catch (e) {
      setErr(e.message || 'Could not post that review');
      setPicked((p) => ({ ...p, [booking.id]: 0 }));
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="pg">
      <div className="hd">
        <div>
          <h1>My reviews</h1>
          <p>Rate your trips. Hosts and other renters rely on it.</p>
        </div>
      </div>

      {err && <div className="ce-err">{err}</div>}
      {loading && <div className="ce-load"><span className="spinner" /><span>Loading your reviews…</span></div>}

      {!loading && !err && !waiting.length && !reviewed.length && (
        <div className="ce-empty">
          <h3>Nothing to rate yet</h3>
          <p>Finish a trip and it will show up here for a star rating.</p>
          <Link className="go" style={{ display: 'inline-block', marginTop: 18, padding: '13px 26px' }} to="/">Find a car</Link>
        </div>
      )}

      {!loading && (waiting.length > 0 || reviewed.length > 0) && (
        <div className="panel rows">
          {waiting.map((b) => (
            <div key={`w-${b.id}`}>
              <div className="th">
                <CarArt accent={paintFor({ id: b.car_id, category: b.car?.category })} upright={uprightFor(b.car)} />
              </div>
              <div>
                <h3>{carTitle(b.car)}</h3>
                <p>{tripRange(b.start_date, b.end_date)} trip · {busy === b.id ? 'Saving…' : 'Tap a star to rate'}</p>
              </div>
              <div className="am" />
              <Stars value={picked[b.id] || 0} onPick={(n) => rate(b, n)} />
            </div>
          ))}

          {reviewed.map((r) => {
            const trip = bookings.find((b) => b.id === r.booking_id);
            const car = trip?.car || r.car;
            return (
              <div key={r.id}>
                <div className="th">
                  <CarArt accent={paintFor({ id: r.car_id, category: car?.category })} upright={uprightFor(car)} />
                </div>
                <div>
                  <h3>{carTitle(car) || r.target_name || 'Trip'}</h3>
                  <p>
                    {trip ? `${tripRange(trip.start_date, trip.end_date)} trip` : `${day(r.created_at)} trip`}
                    {r.comment ? ` · ${r.comment}` : ''}
                  </p>
                </div>
                <div className="am" />
                <Stars value={r.rating} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
