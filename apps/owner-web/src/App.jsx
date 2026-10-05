import { useEffect, useState } from 'react';
import { Routes, Route, Link, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { api, clearSession, currentUser, sessionUser } from './api.js';
import { CarIcon, ClipboardIcon, WalletIcon, StarIcon, ShieldIcon, BellIcon, LogoutIcon, MenuIcon, ChevronLeft, UserIcon } from '../../../packages/shared/src/icons.jsx';
import './sidebar.css';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import VerifyOtp from './pages/VerifyOtp.jsx';
import ProfileDetails from './pages/ProfileDetails.jsx';
import Kyc from './pages/Kyc.jsx';
import Cars from './pages/Cars.jsx';
import CarEditor from './pages/CarEditor.jsx';
import Requests from './pages/Requests.jsx';
import Reviews from './pages/Reviews.jsx';
import Earnings from './pages/Earnings.jsx';
import Notifications from './pages/Notifications.jsx';
import Profile from './pages/Profile.jsx';
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
    { to: '/', icon: <CarIcon />, label: 'My Cars', end: true },
    { to: '/requests', icon: <ClipboardIcon />, label: 'Booking Requests' },
    { to: '/reviews', icon: <StarIcon />, label: 'My Reviews' },
    { to: '/earnings', icon: <WalletIcon />, label: 'Earnings' },
    { to: '/kyc', icon: <ShieldIcon />, label: 'Verification' },
    { to: '/notifications', icon: <BellIcon />, label: 'Notifications' },
    { to: '/profile', icon: <UserIcon />, label: 'Profile' },
  ];

  return (
    <>
      <div className={`sidebar-overlay ${mobileOpen ? 'visible' : ''}`} onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar dark ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`} style={{ '--brand': '#ffffff', '--brand-2': '#ffffff' }}>
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}><ChevronLeft /></button>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">O</div>
          <div className="sidebar-logo-text">
            <h2>OwnerHub</h2>
            <span>Car Owner</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-section-label">Management</p>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}>
              {l.icon}<span className="sidebar-link-text">{l.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-avatar">{user.name?.[0] || 'O'}</div>
          <div className="sidebar-user-info">
            <div className="name">{user.name}</div>
            <div className="role">Car Owner</div>
          </div>
          <button className="sidebar-logout" title="Logout" onClick={() => { clearSession(); nav('/login'); }}>
            <LogoutIcon />
          </button>
        </div>
      </aside>
    </>
  );
}

function Topbar({ mobileOpen, setMobileOpen }) {
  const location = useLocation();
  const titles = { '/': 'My Cars', '/requests': 'Booking Requests', '/reviews': 'My Reviews', '/earnings': 'Earnings & Payouts', '/kyc': 'Verification', '/notifications': 'Notifications', '/profile': 'Profile' };
  return (
    <div className="topbar">
      <button className="topbar-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)}><MenuIcon /></button>
      <span className="topbar-title">{titles[location.pathname] || 'OwnerHub'}</span>
      <div className="topbar-actions" />
    </div>
  );
}

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState(currentUser);
  const location = useLocation();

  // Split by session requirement: /login and /signup are pointless once signed
  // in, so they bounce. /verify-otp and /profile-details are the opposite --
  // they only exist *because* a session exists (both call authenticated
  // endpoints), so they must not redirect an already-signed-in user away.
  const anonPages = ['/login', '/signup'];
  const sessionPages = ['/verify-otp', '/profile-details'];
  const isAuth = anonPages.includes(location.pathname) || sessionPages.includes(location.pathname);

  // Read storage directly rather than trusting `user` state: Signup calls
  // setSession() and then navigates in the same tick, and the state copy only
  // catches up on the next poll. Guarding on the stale value bounced a
  // just-created account to /login. The polled `user` still drives the chrome.
  const signedIn = !!sessionUser();

  useEffect(() => {
    const t = setInterval(() => setUser(JSON.parse(localStorage.getItem('user') || 'null')), 500);
    return () => clearInterval(t);
  }, []);

  // An OTP or profile-details page with no session cannot do anything useful,
  // and both would sit on a "Missing token" error, so send them to log in.
  if (!signedIn && sessionPages.includes(location.pathname)) {
    return <Navigate to="/login" replace />;
  }

  if (signedIn && anonPages.includes(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  if (!signedIn && !isAuth) {
    return (
      <Routes>
        <Route path="/terms" element={<Terms brand="OwnerHub" backTo="/login" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (isAuth) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-otp" element={<VerifyOtp />} />
        <Route path="/profile-details" element={<ProfileDetails />} />
        <Route path="/terms" element={<Terms brand="OwnerHub" backTo="/login" />} />
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
            <Route path="/" element={<Cars />} />
            <Route path="/cars/:id" element={<CarEditor />} />
            <Route path="/requests" element={<Requests />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route path="/earnings" element={<Earnings />} />
            <Route path="/kyc" element={<Kyc />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/terms" element={<Terms brand="OwnerHub" backTo="/" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
