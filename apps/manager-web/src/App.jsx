import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import AuthPage from '../../../packages/shared/src/AuthPage.jsx';
import CrmWorkspace from '../../../packages/shared/src/CrmWorkspace.jsx';
import CrmTeam from '../../../packages/shared/src/CrmTeam.jsx';
import Terms from '../../../packages/shared/src/Terms.jsx';
import { api, clearSession, sessionUser, setSession } from '../../../packages/shared/src/api.js';
import { DashboardIcon, PeopleIcon, LogoutIcon, MenuIcon } from '../../../packages/shared/src/icons.jsx';

export default function App() {
  const [user, setUser] = useState(sessionUser);
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  useEffect(() => { const t = setInterval(() => setUser(sessionUser()), 500); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (sessionUser()) api('/auth/me').then((r) => { if (r.user.role !== 'manager') clearSession(); else setSession(r); setUser(sessionUser()); }).catch(() => { clearSession(); setUser(null); });
  }, []);
  const current = sessionUser();
  if (current && current.role !== 'manager') return <div className="wrap"><h1>Manager portal only</h1><p>This account belongs to a different portal.</p><button className="btn" onClick={() => { clearSession(); setUser(null); }}>Use another account</button></div>;
  if (!current) return <Routes><Route path="/login" element={<AuthPage brand="Operations Hub" portal="manager" roles={['manager']} defaultRole="manager" />} /><Route path="/terms" element={<Terms brand="Operations Hub" backTo="/login" />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>;
  if (location.pathname === '/login') return <Navigate to="/" replace />;
  return <div className="sidebar-layout"><div className={`sidebar-overlay ${mobile ? 'visible' : ''}`} onClick={() => setMobile(false)} /><aside className={`sidebar dark ${mobile ? 'mobile-open' : ''}`}><div className="sidebar-logo"><div className="sidebar-logo-icon">M</div><div className="sidebar-logo-text"><h2>Operations Hub</h2><span>Manager Portal</span></div></div><nav className="sidebar-nav"><p className="sidebar-section-label">Your workspace</p><NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={() => setMobile(false)}><DashboardIcon /><span>Enquiries & quotes</span></NavLink><NavLink to="/team" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={() => setMobile(false)}><PeopleIcon /><span>My team</span></NavLink></nav><div className="sidebar-user"><div className="sidebar-avatar">{user?.name?.[0] || 'M'}</div><div className="sidebar-user-info"><div className="name">{user?.name}</div><div className="role">Operations manager</div></div><button className="sidebar-logout" title="Logout" onClick={() => { clearSession(); setUser(null); }}><LogoutIcon /></button></div></aside><main className="sidebar-main"><div className="topbar"><button className="topbar-mobile-toggle" aria-label="Open navigation" onClick={() => setMobile(!mobile)}><MenuIcon /></button><span className="topbar-title">{location.pathname === '/team' ? 'Team directory' : 'Rental CRM'}</span></div><div className="sidebar-content"><Routes><Route path="/" element={<CrmWorkspace />} /><Route path="/team" element={<CrmTeam />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></div></main></div>;
}
