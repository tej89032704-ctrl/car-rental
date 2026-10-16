import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function Lifetime() {
  if (!currentUser) return <div className="alert info">Login first.</div>;

  const [stats, setStats] = useState([
    { label: 'Total trips', value: 0, suffix: '' },
    { label: 'Total spent', value: 0, suffix: '₹' },
    { label: 'Days driven', value: 0, suffix: '' },
    { label: 'Cars driven', value: 0, suffix: '' },
  ]);
  const [chartData, setChartData] = useState([
    { month: 'Apr', value: 30 },
    { month: 'May', value: 55 },
    { month: 'Jun', value: 40 },
    { month: 'Jul', value: 75 },
    { month: 'Aug', value: 50 },
    { month: 'Sep', value: 90 },
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadLifetimeData = async () => {
      try {
        // In a real app, we would fetch the lifetime stats from the API
        // For now, we'll use mock data or derive from the user's bookings
        // We'll simulate by setting some values
        setStats([
          { label: 'Total trips', value: 12, suffix: '' },
          { label: 'Total spent', value: 38400, suffix: '₹' },
          { label: 'Days driven', value: 27, suffix: '' },
          { label: 'Cars driven', value: 7, suffix: '' },
        ]);
        setChartData([
          { month: 'Apr', value: 30 },
          { month: 'May', value: 55 },
          { month: 'Jun', value: 40 },
          { month: 'Jul', value: 75 },
          { month: 'Aug', value: 50 },
          { month: 'Sep', value: 90 },
        ]);
        setError('');
      } catch (e) {
        if (String(e.message || '').includes('(401)')) {
          window.location.href = import.meta.env.BASE_URL + 'login';
          return;
        }
        setError(e.message || 'Failed to load lifetime data');
      } finally {
        setLoading(false);
      }
    };
    loadLifetimeData();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading lifetime data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-box card">
        <p className="error">{error}</p>
        <button className="btn" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="renter-page-header">
        <span className="header-icon">💎</span>
        <h1>Lifetime</h1>
        <p className="mut">
          Everything you have rented and spent with CAR-ENT. Sample data.
        </p>
      </div>

      <div className="stats">
        {stats.map((stat, index) => (
          <div key={index} className="card sp">
            <b
              data-n={stat.value.toString()}
              data-p={stat.suffix}
            >
              {stat.suffix}{stat.value.toLocaleString('en-IN')}
            </b>
          </div>
        ))}
      </div>

      <div className="two" style={{ gridTemplateColumns: '1fr 280px' }}>
        <div className="card">
          <h3>Spend by month</h3>
          <div className="chart">
            {chartData.map((data) => (
              <div
                key={data.month}
                title={data.month}
                style={{
                  position: 'relative',
                }}
              >
                <i
                  style={{
                    display: 'block',
                    width: '100%',
                    height: `${(data.value / Math.max(...chartData.map(d => d.value))) * 100}%`,
                    backgroundColor: 'var(--ink)',
                    borderRadius: '10px 10px 0 0',
                  }}
                />
                <span className="mut" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center' }}>
                  {data.month}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ display: 'grid', placeItems: 'center', gap: '12px' }}>
          <div className="don" />
          <div className="mut" style={{ textAlign: 'center' }}>
            Paid online 20%<br />
            Paid at pickup 80%
          </div>
        </div>
      </div>

      {/* Back to search link */}
      <div className="back-link">
        <button className="btn sec" onClick={() => window.location.href = import.meta.env.BASE_URL}>
          ← Back to Search
        </button>
      </div>
    </>
  );
}