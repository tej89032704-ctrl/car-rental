import { useEffect, useState } from 'react';
import { Routes, Route, Link, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { api, clearSession, currentUser } from './api.js';
import { SearchIcon, CalendarIcon, ShieldIcon, BellIcon, StarIcon, LogoutIcon, MenuIcon, ChevronLeft } from '../../../packages/shared/src/icons.jsx';
import './sidebar.css';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import VerifyOtp from './pages/VerifyOtp.jsx';
import Search from './pages/Search.jsx';
import CarDetail from './pages/CarDetail.jsx';
import MyBookings from './pages/MyBookings.jsx';
import BookingDetail from './pages/BookingDetail.jsx';
import Kyc from './pages/Kyc.jsx';
import Notifications from './pages/Notifications.jsx';
import Lifetime from './pages/Lifetime.jsx';
import { ForgotPassword, ResetPassword } from './pages/Password.jsx';

function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const nav = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(currentUser);
  useEffect(() => {
    const t = setInterval(() => setUser(JSON.parse(localStorage.getItem('user') || 'null')), 500);
    return () => clearInterval(t);
  }, []);

  if (!user) return null;

  const links = [
    { to: '/', icon: <SearchIcon />, label: 'Find a Car', end: true },
    { to: '/bookings', icon: <CalendarIcon />, label: 'My Bookings' },
    { to: '/kyc', icon: <ShieldIcon />, label: 'Verification' },
    { to: '/notifications', icon: <BellIcon />, label: 'Notifications' },
    { to: '/lifetime', icon: <StarIcon />, label: 'Lifetime' },
  ];

  return (
    <>
      <div className={`sidebar-overlay ${mobileOpen ? 'visible' : ''}`} onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar dark ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}><ChevronLeft /></button>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">D</div>
          <div className="sidebar-logo-text">
            <h2>DriveNow</h2>
            <span>Renter Portal</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-section-label">Navigation</p>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}>
              {l.icon}<span className="sidebar-link-text">{l.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-avatar">{user.name?.[0] || 'U'}</div>
          <div className="sidebar-user-info">
            <div className="name">{user.name}</div>
            <div className="role">Renter</div>
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
  const titles = { '/': 'Find a Car', '/bookings': 'My Bookings', '/kyc': 'Verification', '/notifications': 'Notifications', '/lifetime': 'Lifetime Membership' };
  const title = location.pathname.startsWith('/bookings/') ? 'Booking Details' : (titles[location.pathname] || 'DriveNow');
  return (
    <div className="topbar">
      <button className="topbar-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)}><MenuIcon /></button>
      <span className="topbar-title">{title}</span>
      <div className="topbar-actions" />
    </div>
  );
}

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState(currentUser);
  const location = useLocation();

  const authPages = ['/login', '/signup', '/verify-otp', '/forgot-password', '/reset-password'];
  const isAuth = authPages.includes(location.pathname);

  useEffect(() => {
    const t = setInterval(() => setUser(JSON.parse(localStorage.getItem('user') || 'null')), 500);
    return () => clearInterval(t);
  }, []);

  if (!user && !isAuth) {
    const isPublicBrowse = location.pathname === '/' || location.pathname.startsWith('/cars/');
    if (!isPublicBrowse) return <Navigate to="/login" replace />;
    return (
      <div className="guest-shell">
        <header className="guest-topbar">
          <div className="guest-brand">
            <span className="brand-mark">🚗</span>
            <span className="brand-name">Drive<span className="brand-accent">Now</span></span>
          </div>
          <div className="guest-actions">
            <Link to="/login" className="btn sec sm">Log in</Link>
            <Link to="/signup" className="btn sm">Sign up</Link>
          </div>
        </header>
        <main className="guest-main">
          <Routes>
            <Route path="/" element={<Search />} />
            <Route path="/cars/:id" element={<CarDetail />} />
          </Routes>
        </main>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <div>
              <div className="site-footer-brand"><span className="brand-mark">🚗</span><span className="brand-name">Drive<span className="brand-accent" style={{ color: '#4DD6CF' }}>Now</span></span></div>
              <p className="site-footer-tag">Verified, owner-approved self-drive cars. Browse free — book after a quick KYC check.</p>
            </div>
            <div className="site-footer-links">
              <Link to="/login">Log in</Link>
              <Link to="/signup">Sign up</Link>
              <Link to="/">Browse cars</Link>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  if (user && isAuth) {
    return <Navigate to="/" replace />;
  }

  if (isAuth) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-otp" element={<VerifyOtp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
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
            <Route path="/" element={<Search />} />
            <Route path="/cars/:id" element={<CarDetail />} />
            <Route path="/bookings" element={<MyBookings />} />
            <Route path="/bookings/:id" element={<BookingDetail />} />
            <Route path="/kyc" element={<Kyc />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/lifetime" element={<Lifetime />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
