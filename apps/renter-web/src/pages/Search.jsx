import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, currentUser } from '../api.js';
import {
  CATEGORY_LABEL, carTitle, inr, paintFor, ripple, savedCars, toast, toggleSaved, uprightFor,
} from '../components/ui.js';

const TYPES = ['All', 'Hatchback', 'Sedan', 'SUV', 'Luxury', 'Van'];
const PLACEHOLDERS = ['Hyundai Creta', 'Mahindra Thar', 'BMW 3 Series', 'Tata Nexon EV'];

const localInput = (date) => {
  const x = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 16);
};

function defaults() {
  const from = new Date(Date.now() + 86400000);
  from.setMinutes(0, 0, 0);
  return { from: localInput(from), until: localInput(new Date(from.getTime() + 172800000)) };
}

export default function Search() {
  const nav = useNavigate();
  const [cars, setCars] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [flags, setFlags] = useState({ at: false, ev: false, sv: false });
  const [sort, setSort] = useState('rec');
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState(currentUser?.city || 'Bengaluru');
  const [dates, setDates] = useState(defaults);
  const [saved, setSaved] = useState(savedCars);
  const carsRef = useRef(null);

  useEffect(() => {
    api('/cars/search')
      .then((rows) => { setCars(Array.isArray(rows) ? rows : []); setErr(''); })
      .catch((e) => setErr(e.message || 'Could not load cars'))
      .finally(() => setLoading(false));
  }, []);

  /* The artwork types suggestions into the car field while it is idle. */
  useEffect(() => {
    const input = document.getElementById('ce-q');
    if (!input || matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let word = 0; let i = 0; let del = false; let timer = 0;
    const tick = () => {
      if (document.activeElement === input || input.value) return;
      const w = PLACEHOLDERS[word];
      i += del ? -1 : 1;
      input.placeholder = w.slice(0, i) || 'Any make or model';
      if (!del && i === w.length) { del = true; timer = setTimeout(tick, 1500); return; }
      if (del && i === 0) { del = false; word = (word + 1) % PLACEHOLDERS.length; }
      timer = setTimeout(tick, del ? 35 : 85);
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = cars.filter((c) => {
      const type = CATEGORY_LABEL[String(c.category || '').toLowerCase()] || '';
      if (category !== 'All' && type !== category) return false;
      if (flags.at && String(c.transmission || '').toLowerCase() !== 'automatic') return false;
      if (flags.ev && String(c.fuel_type || '').toLowerCase() !== 'electric') return false;
      if (flags.sv && !saved.includes(c.id)) return false;
      if (q && !`${c.make} ${c.model}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === 'lo') list.sort((a, b) => (a.daily_rate_paise || 0) - (b.daily_rate_paise || 0));
    if (sort === 'hi') list.sort((a, b) => (b.daily_rate_paise || 0) - (a.daily_rate_paise || 0));
    if (sort === 'rt') list.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));
    return list;
  }, [cars, category, flags, query, saved, sort]);

  function clearFilters() {
    setCategory('All');
    setFlags({ at: false, ev: false, sv: false });
    setQuery('');
  }

  function heart(car) {
    const next = toggleSaved(car.id);
    setSaved(next);
    toast(next.includes(car.id) ? 'Saved to your shortlist' : 'Removed from shortlist');
  }

  function quote(car) {
    const params = new URLSearchParams({ from: dates.from, until: dates.until }).toString();
    nav(`/cars/${car.id}?${params}`);
  }

  function submit(e) {
    e.preventDefault();
    toast(`Showing cars for ${place || 'your area'}`);
    carsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className="pg">
      <div className="hero">
        <div>
          <h1>Drive the one you’ll <em>remember.</em></h1>
          <p>Self-drive cars from verified local hosts, delivered to your doorstep. One clear price, no surprises.</p>
          <div className="tr">
            <span>KYC-verified hosts</span>
            <span>Owner-approved cars</span>
            <span>No hidden charges</span>
          </div>
          <div className="live"><i /><span>{loading ? 'Checking availability…' : `${cars.length} car${cars.length === 1 ? '' : 's'} ready now`}</span></div>
          {!currentUser && (
            <div className="ce-form-actions">
              <Link className="go" style={{ margin: 0, padding: '13px 26px' }} to="/signup">Sign up to book</Link>
              <Link className="gh" to="/login">Log in</Link>
            </div>
          )}
        </div>
        <div
          className="stage"
          onPointerMove={(e) => {
            if (!e.currentTarget || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const r = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width - 0.5;
            const y = (e.clientY - r.top) / r.height - 0.5;
            e.currentTarget.style.transform = `perspective(1100px) rotateY(${x * 10}deg) rotateX(${-y * 8}deg)`;
          }}
          onPointerLeave={(e) => { e.currentTarget.style.transform = ''; }}
        >
          {/* A photograph of the real cars rather than the drawn body: the
              showroom line-up is what a renter is actually choosing between.
              BASE_URL carries the portal's path prefix in production. */}
          <figure className="shot">
            <img
              src={`${import.meta.env.BASE_URL}hero-cars.jpg`}
              alt="Cars lined up on the forecourt outside a Car-Ent showroom at golden hour"
              width="800"
              height="320"
              fetchPriority="high"
            />
          </figure>
        </div>
      </div>

      <div className="sw">
        <form className="sb" onSubmit={submit}>
          <div className="f">
            <label htmlFor="ce-loc">Pick-up</label>
            <input id="ce-loc" value={place} onChange={(e) => setPlace(e.target.value)} />
          </div>
          <div className="f">
            <label htmlFor="ce-from">From</label>
            <input id="ce-from" type="datetime-local" value={dates.from} onChange={(e) => setDates({ ...dates, from: e.target.value })} />
          </div>
          <div className="f">
            <label htmlFor="ce-until">Until</label>
            <input id="ce-until" type="datetime-local" value={dates.until} onChange={(e) => setDates({ ...dates, until: e.target.value })} />
          </div>
          <div className="f">
            <label htmlFor="ce-q">Car</label>
            <input id="ce-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Any make or model" />
          </div>
          <button className="go" type="submit">Search</button>
        </form>
      </div>

      <div className="fb">
        {TYPES.map((t) => (
          <button key={t} type="button" className="t" aria-pressed={category === t}
            onClick={(e) => { ripple(e); setCategory(t); }}>
            {t}
          </button>
        ))}
        <div className="sp">
          <button type="button" className="sw2" aria-pressed={flags.at} onClick={() => setFlags({ ...flags, at: !flags.at })}>Automatic</button>
          <button type="button" className="sw2" aria-pressed={flags.ev} onClick={() => setFlags({ ...flags, ev: !flags.ev })}>Electric</button>
          <button type="button" className="sw2" aria-pressed={flags.sv} onClick={() => setFlags({ ...flags, sv: !flags.sv })}>Saved</button>
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="rec">Recommended</option>
            <option value="lo">Price, low to high</option>
            <option value="hi">Price, high to low</option>
            <option value="rt">Top rated</option>
          </select>
        </div>
      </div>

      {err && <div className="ce-err">{err}</div>}
      {loading && !err && <div className="ce-load"><span className="spinner" /><span>Loading the fleet…</span></div>}

      <div className="grid" ref={carsRef}>
        {!loading && !visible.length && !err && (
          <div className="em">
            <h3>Nothing matches yet</h3>
            <p>Your search stays open. Loosen a filter, or we will alert you when a host lists a match.</p>
            <button className="go" type="button" onClick={clearFilters}>Clear filters</button>
          </div>
        )}

        {visible.map((car, i) => {
          const type = CATEGORY_LABEL[String(car.category || '').toLowerCase()] || car.category;
          const isSaved = saved.includes(car.id);
          const rating = Number(car.avg_rating || 0);
          return (
            <article className="card" key={car.id} style={{ '--i': i }}>
              <div className="pic">
                <span className="cl">{car.make}</span>
                <button
                  type="button"
                  className="hr"
                  aria-pressed={isSaved}
                  aria-label={`${isSaved ? 'Remove' : 'Save'} ${carTitle(car)}`}
                  onClick={() => heart(car)}
                >
                  ♥
                </button>
                <CarArt accent={paintFor(car)} upright={uprightFor(car)} />
              </div>
              <div className="bd">
                <Link to={`/cars/${car.id}`}><h3>{carTitle(car)}</h3></Link>
                <div className="sc">
                  <span>{String(car.transmission || '').toLowerCase() === 'automatic' ? 'Automatic' : 'Manual'}</span>
                  <span>{car.seats || 5} seats</span>
                  <span>{type}</span>
                  <span>★ {rating ? rating.toFixed(1) : 'New'}{car.total_reviews ? ` · ${car.total_reviews}` : ''}</span>
                </div>
                <div className="pr">
                  <div>
                    <b>{car.daily_rate_paise ? inr(car.daily_rate_paise) : '—'}</b> <small>per day, all-in</small>
                  </div>
                  <button type="button" className="gh" onClick={(e) => { ripple(e); quote(car); }}>Get quote</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
