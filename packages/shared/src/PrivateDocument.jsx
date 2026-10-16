import { useEffect, useState } from 'react';
import { documentBlob } from './api.js';

export default function PrivateDocument({ url, label = 'View file', thumbnail = false }) {
  const [blobUrl, setBlobUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);
  async function load() {
    setBusy(true); setError('');
    try { setBlobUrl(URL.createObjectURL(await documentBlob(url))); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <span>
    {blobUrl ? <a className="btn sec sm" href={blobUrl} target="_blank" rel="noreferrer">{label}</a> : <button type="button" className="btn sec sm" disabled={busy} onClick={load}>{busy ? 'Loading…' : label}</button>}
    {thumbnail && blobUrl && <img src={blobUrl} alt="Submitted document" style={{ display: 'block', width: 64, height: 64, objectFit: 'cover', marginTop: 6 }} />}
    {error && <span role="alert">{error}</span>}
  </span>;
}
