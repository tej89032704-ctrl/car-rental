import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function Kyc() {
  if (!currentUser) return <div className="alert info">Login first.</div>;

  const [steps, setSteps] = useState([0, 0, 0]); // 0: not started, 1: verified, 2: in review
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadVerificationStatus = async () => {
      try {
        // In a real app, we would fetch the verification status from the API
        // For now, we'll simulate based on the user's KYC status from the user object
        const user = currentUser;
        // Assuming the user object has a kyc_status field: 0=not started, 1=verified, 2=in review
        // We'll set the steps array based on that
        const status = user.kyc_status || 0;
        const stepsArray = [0, 0, 0];
        if (status >= 1) stepsArray[0] = 1;
        if (status >= 2) stepsArray[1] = 2;
        setSteps(stepsArray);
        setError('');
      } catch (e) {
        if (String(e.message || '').includes('(401)')) {
          window.location.href = '/login';
          return;
        }
        setError(e.message || 'Failed to load verification status');
      } finally {
        setLoading(false);
      }
    };
    loadVerificationStatus();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading verification status…</p>
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

  // Calculate completion percentage
  const completedSteps = steps.filter(s => s === 1).length;
  const inReviewSteps = steps.filter(s => s === 2).length;
  const percentage = Math.round(((completedSteps * 1) + (inReviewSteps * 0.5)) / 3 * 100);

  return (
    <>
      <div className="renter-page-header">
        <span className="header-icon">🛡️</span>
        <h1>Verification</h1>
        <p className="mut">
          Complete KYC to book cars without delays.
        </p>
      </div>

      <div className="two" style={{ gridTemplateColumns: '260px 1fr' }}>
        <div className="card" style={{ display: 'grid', placeItems: 'center', gap: '12px' }}>
          <div className="ring">
            <svg viewBox="0 0 100 100" width="150" height="150">
              <circle className="tr" cx="50" cy="50" r="45" stroke="var(--line)" strokeWidth="2" fill="none" />
              <circle
                className="pg"
                cx="50"
                cy="50"
                r="45"
                stroke="var(--ink)"
                strokeWidth="2"
                fill="none"
                style={{
                  strokeDasharray: '283',
                  strokeDashoffset: `${283 - (283 * percentage) / 100}`,
                  transition: 'stroke-dashoffset 1s',
                }}
              />
            </svg>
            <b>{percentage}%</b>
          </div>
          <span className={`badge ${percentage === 100 ? 'confirmed' : 'pending'}`}>
            {percentage === 100 ? 'Fully verified' : 'In progress'}
          </span>
        </div>

        <div className="card">
          <div className="step">
            <div className={`dot s${steps[0]}`}>{steps[0] === 1 ? '✓' : '1'}</div>
            <div style={{ flex: 1 }}>
              <b>Phone number</b>
              <div className="mut">
                {steps[0] === 1 ? 'Verified' : steps[0] === 2 ? 'In review…' : 'Verify with OTP'}
              </div>
            </div>
            {steps[0] === 0 && (
              <label className="drop">
                ⬆ Drop a file or click to upload
                <input type="file" hidden />
              </label>
            )}
          </div>
          <div className="step">
            <div className={`dot s${steps[1]}`}>{steps[1] === 1 ? '✓' : '2'}</div>
            <div style={{ flex: 1 }}>
              <b>Driving licence</b>
              <div className="mut">
                {steps[1] === 1 ? 'Verified' : steps[1] === 2 ? 'In review…' : 'Upload front and back'}
              </div>
            </div>
            {steps[1] === 0 && (
              <label className="drop">
                ⬆ Drop a file or click to upload
                <input type="file" hidden />
              </label>
            )}
          </div>
          <div className="step">
            <div className={`dot s${steps[2]}`}>{steps[2] === 1 ? '✓' : '3'}</div>
            <div style={{ flex: 1 }}>
              <b>Government ID</b>
              <div className="mut">
                {steps[2] === 1 ? 'Verified' : steps[2] === 2 ? 'In review…' : 'Aadhaar, PAN or passport'}
              </div>
            </div>
            {steps[2] === 0 && (
              <label className="drop">
                ⬆ Drop a file or click to upload
                <input type="file" hidden />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Back to search link */}
      <div className="back-link">
        <button className="btn sec" onClick={() => window.location.href = '/'}>
          ← Back to Search
        </button>
      </div>
    </>
  );
}