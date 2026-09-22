import { useEffect, useState } from 'react';
import { api, currentUser, setSession } from '../api.js';

export function useAdmin() {
  const [user, setUser] = useState(currentUser);
  useEffect(() => {
    const t = setInterval(() => setUser(JSON.parse(localStorage.getItem('user') || 'null')), 500);
    return () => clearInterval(t);
  }, []);
  return user;
}

export async function refreshMe() {
  try { const d = await api('/auth/me'); setSession({ user: d.user }); } catch { /* noop */ }
}
