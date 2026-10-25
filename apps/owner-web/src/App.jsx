import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, sessionUser } from './api.js';
import { DataProvider, useData, useUnread } from './data.jsx';
import { CarBuildLoader, Icon, OverlayHost, ToastHost, useToast, useTopProgress } from './ui.jsx';
import { OverlayRenderer } from './overlays.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import VerifyOtp from './pages/VerifyOtp.jsx';
import ProfileDetails from './pages/ProfileDetails.jsx';
import Kyc from './pages/Kyc.jsx';
import Cars from './pages/Cars.jsx';
import CarEditor from './pages/CarEditor.jsx';
import Requests from './pages/Requests.jsx';
import CalendarPage from './pages/Calendar.jsx';
import Reviews from './pages/Reviews.jsx';
import Earnings from './pages/Earnings.jsx';
import Membership from './pages/Membership.jsx';
import Notifications from './pages/Notifications.jsx';
import Profile from './pages/Profile.jsx';
import Terms from '../../../packages/shared/src/Terms.jsx';
import { NAV, sectionOf } from './nav.js';

/**
 * OwnerHub shell.
 *
 * The signed-in screen is a rebuild of the OwnerHub reference panel: one grid
 * of a 272px dark rail and a mint canvas, with a sticky topbar carrying the
 * section title, the Ctrl+K palette, the clock, the theme switch and the bell.
 * The rail keeps no collapsed or mobile state of its own -- the reference drops
 * to a 70px icon rail purely in CSS at 900px, so there is nothing to toggle.
 */

function Sidebar({ pending, unreadCount }) {
  const navigate = useNavigate();
  const user = sessionUser();

  return (
    <aside>
      <div className="bn">
        <span className="lg">O</span>
        <div><b>OwnerHub</b><small>Car owner</small></div>
      </div>
      <div className="lb">Management</div>
      <nav aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.k} to={n.to} end={n.end}
            className={({ isActive }) => `nv ${isActive ? 'on' : ''}`}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
            {n.k === 'reqs' && pending > 0 && <em>{pending}</em>}
            {n.k === 'not' && unreadCount > 0 && <em>{unreadCount}</em>}
          </NavLink>
        ))}
      </nav>
      <div className="us">
        <i>{((user && user.name) || 'O')[0].toUpperCase()}</i>
        <div><b>{(user && user.name) || 'Owner'}</b><small>Car owner</small></div>
      </div>
      <button className="o" style={{ marginTop: 10, color: '#9fc0b0' }}
        onClick={() => { clearSession(); navigate('/login'); }}>
        Log out
      </button>
    </aside>
  );
}

function Topbar({ onSearch, bellRef, theme, onTheme, onBell, unreadCount }) {
  const location = useLocation();
  const clockRef = useRef(null);
  const sec = sectionOf(location.pathname);

  useEffect(() => {
    const tick = () => {
      const el = clockRef.current;
      if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="tp">
      <div>
        <h1>{sec.label}</h1>
        <div className="sub">{sec.sub}</div>
      </div>
      <div className="sp">
        <button className="sbtn" onClick={onSearch} aria-label="Search">
          <Icon name="search" size={17} />
          <span>Search</span>
          <kbd className="kb">Ctrl K</kbd>
        </button>
        <span className="lvp"><span className="dot" /><span id="clk" ref={clockRef}>--:--:--</span></span>
        <button className="ib" onClick={onTheme} aria-label="Toggle theme">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
        <button className="ib" ref={bellRef} onClick={onBell} aria-label="Notifications">
          <Icon name="bell" size={18} />
          {unreadCount > 0 && <b>{unreadCount}</b>}
        </button>
      </div>
    </div>
  );
}

/* The reference paints its car-build loader on first paint and again on every
   section change. We keep the same 2.3s beat for a cold load only -- after
   that the section swap is instant, and spinning on each navigation would be
   theatre rather than feedback. */
function useColdStart() {
  const [cold, setCold] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setCold(false), 2300);
    return () => clearTimeout(t);
  }, []);
  return cold;
}

function Shell() {
  const { requests } = useData();
  const { unread } = useUnread();
  const [overlay, setOverlay] = useState(null);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('oh-th') || ''; } catch { return ''; }
  });
  const bellRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const cold = useColdStart();
  const toast = useToast();

  useTopProgress(location.pathname);

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const isDark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('oh-th', next); } catch { /* private mode */ }
  }, [theme]);

  const openPalette = useCallback(() => setOverlay({ type: 'palette' }), []);
  const openNotifs = useCallback(() => navigate('/notifications'), [navigate]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOverlay((o) => (o && o.type === 'palette' ? o : { type: 'palette' }));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* Ripple and card spotlight are pointer-driven, so both bind once at the
     document level instead of to every node each render. */
  useEffect(() => {
    const down = (e) => {
      const b = e.target.closest('.b,.o,.ib');
      if (!b) return;
      const r = b.getBoundingClientRect();
      const d = Math.max(r.width, r.height) * 2;
      const s = document.createElement('span');
      s.className = 'rip';
      s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
      b.append(s);
      setTimeout(() => s.remove(), 650);
    };
    const move = (e) => {
      const c = e.target.closest('.c');
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('mousemove', move);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('mousemove', move);
    };
  }, []);

  const shakeBell = useCallback(() => {
    const b = bellRef.current;
    if (!b) return;
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
  }, []);

  const sec = sectionOf(location.pathname);
  const known = NAV.some((n) => n.to === location.pathname);

  const body = useMemo(() => {
    if (cold) return <CarBuildLoader title={sec.label} skeletons={sec.k === 'cars' ? 'grid' : 'list'} />;
    if (!known) return <Cars />;
    switch (location.pathname) {
      case '/': return <Cars />;
      case '/requests': return <Requests />;
      case '/calendar': return <CalendarPage />;
      case '/reviews': return <Reviews />;
      case '/earnings': return <Earnings />;
      case '/membership': return <Membership />;
      case '/kyc': return <Kyc />;
      case '/notifications': return <Notifications />;
      case '/profile': return <Profile />;
      default: return <Cars />;
    }
  }, [cold, location.pathname, known, sec.label, sec.k]);

  const pendingCount = requests.filter((r) => r.status === 'requested').length;
  const unreadCount = unread.length;

  return (
    <OverlayHost
      overlay={overlay}
      setOverlay={setOverlay}
      render={(o) => (
        <OverlayRenderer overlay={o} close={() => setOverlay(null)}
          open={(type, payload) => setOverlay({ type, payload })}
          toast={toast} go={navigate} bellShake={shakeBell} />
      )}
    >
      <div className="oh">
        <div className="amb" aria-hidden="true"><i /><i /><i /></div>
        <div className="pb" id="pb" />
        <Sidebar pending={pendingCount} unreadCount={unreadCount} />
        <main>
          <Topbar onSearch={openPalette} bellRef={bellRef} theme={theme}
            onTheme={toggleTheme} onBell={openNotifs} unreadCount={unreadCount} />
          <div className="pg" key={location.pathname}>
            <Routes>
              <Route path="/cars/:id" element={<CarEditor />} />
              <Route path="/terms" element={<Terms brand="OwnerHub" backTo="/" />} />
              <Route path="*" element={body} />
            </Routes>
          </div>
        </main>
      </div>
    </OverlayHost>
  );
}

const anonPages = ['/login', '/signup'];
const sessionPages = ['/verify-otp', '/profile-details'];

export default function App() {
  const location = useLocation();
  const [, setTick] = useState(0);

  // Polled so a sign-in or sign-out in another tab repaints the guard below.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const isAuth = anonPages.includes(location.pathname) || sessionPages.includes(location.pathname);
  const signedIn = !!sessionUser();

  if (!signedIn && sessionPages.includes(location.pathname)) return <Navigate to="/login" replace />;
  if (signedIn && anonPages.includes(location.pathname)) return <Navigate to="/" replace />;

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
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <ToastHost>
      <DataProvider>
        <Shell />
      </DataProvider>
    </ToastHost>
  );
}
