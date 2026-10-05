import { useEffect, useState } from 'react';
import { Routes, Route, Link, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { api, clearSession, currentUser, sessionUser } from './api.js';
import { SearchIcon, CalendarIcon, ShieldIcon, BellIcon, StarIcon, MoneyIcon, LogoutIcon, MenuIcon, ChevronLeft, UserIcon } from '../../../packages/shared/src/icons.jsx';
import './sidebar.css';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import VerifyOtp from './pages/VerifyOtp.jsx';
import ProfileDetails from './pages/ProfileDetails.jsx';
import Search from './pages/Search.jsx';
import CarDetail from './pages/CarDetail.jsx';
import MyBookings from './pages/MyBookings.jsx';
import BookingDetail from './pages/BookingDetail.jsx';
import Kyc from './pages/Kyc.jsx';
import Notifications from './pages/Notifications.jsx';
import Reviews from './pages/Reviews.jsx';
import Lifetime from './pages/Lifetime.jsx';
import Profile from './pages/Profile.jsx';
import { ForgotPassword, ResetPassword } from './pages/Password.jsx';
import Terms from '../../../packages/shared/src/Terms.jsx';

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
    { to: '/reviews', icon: <StarIcon />, label: 'My Reviews' },
    { to: '/kyc', icon: <ShieldIcon />, label: 'Verification' },
    { to: '/notifications', icon: <BellIcon />, label: 'Notifications' },
    { to: '/lifetime', icon: <MoneyIcon />, label: 'Lifetime' },
    { to: '/profile', icon: <UserIcon />, label: 'Profile' },
  ];

  return (
    <>
      <div className={`sidebar-overlay ${mobileOpen ? 'visible' : ''}`} onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar dark ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}><ChevronLeft /></button>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">C</div>
          <div className="sidebar-logo-text">
            <h2>CAR-ENT</h2>
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
  const titles = { '/': 'Find a Car', '/bookings': 'My Bookings', '/reviews': 'My Reviews', '/kyc': 'Verification', '/notifications': 'Notifications', '/lifetime': 'Lifetime Membership', '/profile': 'Profile' };
  const title = location.pathname.startsWith('/bookings/') ? 'Booking Details' : (titles[location.pathname] || 'CAR-ENT');
  return (
    <div className="topbar">
      <span className="topbar-title">{title}</span>
    </div>
  );
}

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState(currentUser);
  const location = useLocation();

  // Pages that render the auth shell instead of the sidebar chrome, split by
  // session requirement. /login and /signup are pointless once signed in, so
  // they bounce. /verify-otp and /profile-details are the opposite: they only
  // exist *because* a session exists (both call authenticated endpoints), so
  // they must not redirect an already-signed-in user away.
  const anonPages = ['/login', '/signup', '/forgot-password', '/reset-password'];
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
    const isPublicBrowse = location.pathname === '/' || location.pathname.startsWith('/cars/') || location.pathname === '/terms';
    if (!isPublicBrowse) return <Navigate to="/login" replace />;
    return (
      <div className="guest-shell">
        <header className="guest-topbar">
          <div className="guest-brand">
            <span className="brand-mark">🚗</span>
            <span className="brand-name">CAR-ENT</span>
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
            <Route path="/terms" element={<Terms brand="CAR-ENT" backTo="/" />} />
          </Routes>
        </main>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <div>
              <div className="site-footer-brand"><span className="brand-mark">🚗</span><span className="brand-name">CAR-ENT</span></div>
              <p className="site-footer-tag">Verified, owner-approved self-drive cars. Browse free — book after a quick KYC check.</p>
            </div>
            <div className="site-footer-links">
              <Link to="/login">Log in</Link>
              <Link to="/signup">Sign up</Link>
              <Link to="/">Browse cars</Link>
              <Link to="/terms">Terms &amp; Conditions</Link>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  if (isAuth) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-otp" element={<VerifyOtp />} />
        <Route path="/profile-details" element={<ProfileDetails />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    );
  }

  return (
    <div className={`sidebar-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <main className="sidebar-main">
        <Topbar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
        <div className="sidebar-content">
          <Routes>
            <Route path="/" element={<Search />} />
            <Route path="/cars/:id" element={<CarDetail />} />
            <Route path="/bookings" element={<MyBookings />} />
            <Route path="/bookings/:id" element={<BookingDetail />} />
            <Route path="/kyc" element={<Kyc />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/lifetime" element={<Lifetime />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/terms" element={<Terms brand="CAR-ENT" backTo="/" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
