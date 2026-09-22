const BASE = '/api';

let accessToken = localStorage.getItem('access_token') || '';
let refreshToken = localStorage.getItem('refresh_token') || '';
export let currentUser = JSON.parse(localStorage.getItem('user') || 'null');

export function setSession({ access_token, refresh_token, user }) {
  if (access_token) {
    accessToken = access_token;
    localStorage.setItem('access_token', access_token);
  }
  if (refresh_token) {
    refreshToken = refresh_token;
    localStorage.setItem('refresh_token', refresh_token);
  }
  if (user) {
    currentUser = user;
    localStorage.setItem('user', JSON.stringify(user));
  }
}

export function clearSession() {
  accessToken = ''; refreshToken = ''; currentUser = null;
  ['access_token', 'refresh_token', 'user'].forEach((k) => localStorage.removeItem(k));
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res = await fetch(BASE + path, { method, headers, body: payload });
  if (res.status === 401 && refreshToken) {
    const r = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (r.ok) {
      const data = await r.json();
      setSession(data);
      headers.Authorization = `Bearer ${data.access_token}`;
      res = await fetch(BASE + path, { method, headers, body: payload });
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export function uploadForm(fields) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  return fd;
}
