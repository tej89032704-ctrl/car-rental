import { useEffect, useState } from 'react';
import { Routes, Route, Link, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { api, clearSession, currentUser, sessionUser } from './api.js';
import { DashboardIcon, BellIcon, LogoutIcon, MenuIcon, ChevronLeft } from '../../../packages/shared/src/icons.jsx';
import './sidebar.css';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import VerifyOtp from './pages/VerifyOtp.jsx';
import ProfileDetails from './pages/ProfileDetails.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Notifications from './pages/Notifications.jsx';
import CrmWorkspace from '../../../packages/shared/src/CrmWorkspace.jsx';
import Terms from '../../../packages/shared/src/Terms.jsx';

function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const nav = useNavigate();
  const [user, setUser] = useState(currentUser);
  useEffect(() => {
    const t = setInterval(() => setUser(JSON.parse(localStorage.getItem('user') || 'null')), 500);
    return () => clearInterval(t);
  }, []);

  if (!user) return null;

  const links = [
    { to: '/', icon: <DashboardIcon />, label: 'Dashboard', end: true },
    { to: '/crm', icon: <DashboardIcon />, label: 'Enquiries & Quotes' },
    { to: '/notifications', icon: <BellIcon />, label: 'Notifications' },
  ];

  return (
    <>
      <div className={`sidebar-overlay ${mobileOpen ? 'visible' : ''}`} onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar dark ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}><ChevronLeft /></button>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">A</div>
          <div className="sidebar-logo-text">
            <h2>AgentField</h2>
            <span>Agent Portal</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-section-label">Menu</p>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}>
              {l.icon}<span className="sidebar-link-text">{l.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-avatar">{user.name?.[0] || 'A'}</div>
          <div className="sidebar-user-info">
            <div className="name">{user.name}</div>
            <div className="role">Field Agent</div>
          </div>
          <button className="sidebar-logout" title="Logout" onClick={() => { clearSession(); nav('/agent/login'); }}>
            <LogoutIcon />
          </button>
        </div>
      </aside>
    </>
  );
}

function Topbar({ mobileOpen, setMobileOpen }) {
  const location = useLocation();
  const titles = {
    '/': 'Agent Dashboard',
    '/crm': 'Enquiries & Quotes',
    '/notifications': 'Notifications',
  };
  return (
    <div className="topbar">
      <button className="topbar-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)}><MenuIcon /></button>
      <span className="topbar-title">{titles[location.pathname] || 'AgentField'}</span>
      <div className="topbar-actions" />
    </div>
  );
}

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState(currentUser);
  const location = useLocation();

  // Split by session requirement: /agent/login and /signup are pointless once
  // signed in, so they bounce. /verify-otp and /profile-details are the
  // opposite -- they only exist *because* a session exists (both call
  // authenticated endpoints), so they must not redirect a signed-in user away.
  const anonPages = ['/agent/login', '/signup'];
  const sessionPages = ['/verify-otp', '/profile-details'];
  const isAuth = anonPages.includes(location.pathname) || sessionPages.includes(location.pathname);

  // Read storage directly rather than trusting `user` state: Signup calls
  // setSession() and then navigates in the same tick, and the state copy only
  // catches up on the next poll. Guarding on the stale value bounced a
  // just-created account to /agent/login. The polled `user` drives the chrome.
  const signedIn = !!sessionUser();

  useEffect(() => {
    const t = setInterval(() => setUser(JSON.parse(localStorage.getItem('user') || 'null')), 500);
    return () => clearInterval(t);
  }, []);

  // An OTP or profile-details page with no session cannot do anything useful,
  // and both would sit on a "Missing token" error, so send them to log in.
  if (!signedIn && sessionPages.includes(location.pathname)) {
    return <Navigate to="/agent/login" replace />;
  }

  if (signedIn && anonPages.includes(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  if (!signedIn && !isAuth) {
    return (
      <Routes>
        <Route path="/terms" element={<Terms brand="AgentField" backTo="/agent/login" />} />
        <Route path="*" element={<Navigate to="/agent/login" replace />} />
      </Routes>
    );
  }

  if (isAuth) {
    return (
      <Routes>
        <Route path="/agent/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-otp" element={<VerifyOtp />} />
        <Route path="/profile-details" element={<ProfileDetails />} />
        <Route path="/terms" element={<Terms brand="AgentField" backTo="/agent/login" />} />
      </Routes>
    );
  }

  return (
    <div className="sidebar-layout">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <main className={`sidebar-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <Topbar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
        <div className="sidebar-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/crm" element={<CrmWorkspace />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/terms" element={<Terms brand="AgentField" backTo="/" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
