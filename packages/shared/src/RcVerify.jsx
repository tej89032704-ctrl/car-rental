/**
 * Shared building blocks for live car (RC/VAHAN) verification.
 *
 * `RcVerifyBlock` renders one verification outcome — either the fresh response
 * from `POST /cars/:id/verify` (shape: { provider, live, verdict, vehicle,
 * match_make_model, message, ... }) or a persisted `car_verifications` row
 * (shape: { provider, live, status, registered_make, registered_model,
 * match_make_model, details(JSON), message, ... }) so both admin and owner
 * portals can render the same panel with one component.
 */

export function verificationPillClass(status) {
  return { verified: 'active', failed: 'cancelled', pending: 'pending', unverified: 'pending' }[status] || 'pending';
}

function parseDetails(row) {
  if (!row) return null;
  if (row.vehicle) return row.vehicle;
  if (row.details) { try { return JSON.parse(row.details); } catch { return null; } }
  if (row.registered_make || row.registered_model) {
    return {
      maker: row.registered_make,
      model: row.registered_model,
      registration_number: row.plate_number,
    };
  }
  return null;
}

const ValueRow = ({ k, v }) => v ? (
  <div className="info-row">
    <span className="info-label">{k}</span>
    <span className="info-value">{v}</span>
  </div>
) : null;

export function RcVerifyBlock({ v }) {
  if (!v) return null;
  const status = (v.status || v.verdict || 'pending').toLowerCase();
  const isVerified = status === 'verified';
  const vehicle = parseDetails(v);
  return (
    <div className={`verify-result ${isVerified ? 'is-ok' : 'is-bad'}`}>
      <div className="verify-head">
        <span className={`pill ${verificationPillClass(status)}`}>{status.toUpperCase()}</span>
        <span className={`pill ${v.live ? 'active' : ''}`}>{v.live ? 'LIVE RTO' : 'DEMO'}</span>
        <span className="pill">{v.provider === 'vahan' ? 'VAHAN' : 'RTO demo'}</span>
        {isVerified && (
          v.match_make_model
            ? <span className="pill active">MODEL MATCHES RC ✓</span>
            : <span className="pill cancelled">MODEL DIFFERS FROM RC ⚠</span>
        )}
      </div>
      {v.message && <p className="muted verify-msg">{v.message}</p>}
      {vehicle && (
        <div className="verify-vehicle">
          <div className="info-row">
            <span className="info-label">Registered</span>
            <span className="info-value"><b>{vehicle.maker} {vehicle.model}</b> · {vehicle.registration_number}</span>
          </div>
          <ValueRow k="Registration date" v={vehicle.registration_date} />
          <ValueRow k="RTO code" v={vehicle.rto_code} />
          <ValueRow k="Fuel" v={vehicle.fuel_type} />
          <ValueRow k="Fitness valid until" v={vehicle.fitness_upto} />
          <ValueRow k="Insurance until" v={vehicle.insurance_upto} />
          <ValueRow k="Owner (masked)" v={vehicle.owner_masked} />
        </div>
      )}
    </div>
  );
}