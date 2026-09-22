import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, currentUser } from '../api.js';

const EMPTY = { make: '', model: '', year: 2024, plate_number: '', category: 'hatchback', transmission: 'manual', fuel_type: 'petrol', seats: 5 };

export default function Cars() {
  const [cars, setCars] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');

  async function load() {
    try { setCars(await api(`/cars/mine${filter ? `?status=${filter}` : ''}`)); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { if (currentUser) load(); }, [filter]);

  async function add(e) {
    e.preventDefault();
    setErr('');
    try {
      const car = await api('/cars', { method: 'POST', body: { ...form, year: +form.year, seats: +form.seats } });
      window.location.href = `/cars/${car.id}`;
    } catch (e2) { setErr(e2.message); }
  }

  if (!currentUser) return <div className="alert info"><Link to="/login">Login</Link> to manage your fleet.</div>;

  return (
    <div className="wrap">
      <div className="page-header-row">
        <h1>My cars</h1>
        <button className="btn" onClick={() => setShowAdd(!showAdd)}>+ Add car</button>
      </div>
      {err && <div className="alert err">{err}</div>}
      {showAdd && (
        <div className="card">
          <h2>New car</h2>
          <form onSubmit={add}>
            <div className="row">
              <div className="form-group"><label className="f">Make</label><input className="f" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} required /></div>
              <div className="form-group"><label className="f">Model</label><input className="f" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required /></div>
              <div className="form-group"><label className="f">Year</label><input className="f" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} required /></div>
            </div>
            <div className="row">
              <div className="form-group"><label className="f">Plate number</label><input className="f" value={form.plate_number} onChange={(e) => setForm({ ...form, plate_number: e.target.value })} required /></div>
              <div className="form-group">
                <label className="f">Category</label>
                <select className="f" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {['hatchback', 'sedan', 'suv', 'luxury', 'van'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="f">Transmission</label>
                <select className="f" value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value })}>
                  <option>manual</option><option>automatic</option>
                </select>
              </div>
            </div>
            <div className="row">
              <div className="form-group">
                <label className="f">Fuel</label>
                <select className="f" value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}>
                  {['petrol', 'diesel', 'ev', 'cng'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="f">Seats</label><input className="f" type="number" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} required /></div>
            </div>
            <br />
            <button className="btn">Create car</button>
            <p className="muted">Next: add 4+ photos, RC book + insurance, set pricing, then submit for review.</p>
          </form>
        </div>
      )}
      <div className="tabs">
        {['', 'draft', 'pending_review', 'active', 'inactive', 'rejected'].map((s) => (
          <button key={s} className={`tab ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>{s || 'All'}</button>
        ))}
      </div>
      {cars.length === 0 && <div className="card"><p className="muted">No cars in this view.</p></div>}
      <div className="grid-cars">
        {cars.map((c) => (
          <div className="car-card" key={c.id}>
            {c.photos && c.photos[0] && <img src={c.photos[0].file_url} alt={`${c.make} ${c.model}`} />}
            <div className="car-body">
              <div className="car-title">{c.make} {c.model}</div>
              <div className="car-meta">{c.year} · {c.plate_number}</div>
              <div className="car-meta">{c.photo_count} photo(s)</div>
              <div className="card-footer-row">
                <span className={`pill ${c.status}`}>{c.status}</span>
                <Link className="btn sec sm" to={`/cars/${c.id}`}>Manage</Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
