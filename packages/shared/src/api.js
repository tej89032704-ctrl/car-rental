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

/**
 * Reads the cached user straight from storage.
 *
 * `currentUser` is a module-level snapshot taken when this module was first
 * imported, and the components that cache it in React state lag behind a
 * setSession() call by up to one poll interval. Routing guards that need an
 * up-to-the-moment answer must call this instead, or a signup that logs in and
 * immediately navigates will be treated as anonymous and bounced to /login.
 */
export function sessionUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export function clearSession() {
  accessToken = ''; refreshToken = ''; currentUser = null;
  ['access_token', 'refresh_token', 'user'].forEach((k) => localStorage.removeItem(k));
}

/**
 * Refresh is single-flight. Every request on a page shares one 15-minute
 * access token, so they all 401 at the same moment; if each one POSTed
 * /auth/refresh, the first would rotate the refresh token and revoke the
 * session while the rest were still in flight, and those losers would fall
 * through to the caller's original 401 — which the UI shows as "Invalid or
 * expired token". One in-flight promise, awaited by all of them.
 */
let refreshInFlight = null;

function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const r = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (r.ok) {
          setSession(await r.json());
          return true;
        }
        // The server explicitly rejected the session, so drop it: every app
        // polls localStorage for `user` and redirects to /login when it goes
        // null, which is a better answer than surfacing the raw 401 in the
        // page body. A network failure (the catch below) is not a verdict, so
        // it leaves the session alone and the caller keeps its original error.
        if (r.status === 401 || r.status === 403) clearSession();
        return false;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
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
  if (res.status === 401 && refreshToken && (await refreshSession())) {
    // setSession() already installed the rotated token in this module.
    headers.Authorization = `Bearer ${accessToken}`;
    res = await fetch(BASE + path, { method, headers, body: payload });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function documentBlob(path) {
  if (!/^\/uploads\/[0-9a-f-]{36}\.[a-zA-Z0-9]+$/.test(path)) throw new Error('Invalid document path');
  let res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401 && refreshToken && await refreshSession()) {
    res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${accessToken}` } });
  }
  if (!res.ok) throw new Error('Document unavailable or access denied');
  return await res.blob();
}

export function uploadForm(fields) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  return fd;
}
