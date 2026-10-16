import { useEffect, useState } from 'react';
import { Routes, Route, Link, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { api, clearSession, currentUser } from './api.js';
import { DashboardIcon, UsersIcon, CarIcon, ShieldIcon, WalletIcon, AlertIcon, PeopleIcon, SettingsIcon, LogoutIcon, MenuIcon, ChevronLeft } from '../../../packages/shared/src/icons.jsx';
import './sidebar.css';
import './auth.css';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Users from './pages/Users.jsx';
import CarQueue from './pages/CarQueue.jsx';
import KycQueue from './pages/KycQueue.jsx';
import Settings from './pages/Settings.jsx';
import Payouts from './pages/Payouts.jsx';
import Disputes from './pages/Disputes.jsx';
import Agents from './pages/Agents.jsx';
import CrmWorkspace from '../../../packages/shared/src/CrmWorkspace.jsx';
import CrmTeam from '../../../packages/shared/src/CrmTeam.jsx';
import Terms from '../../../packages/shared/src/Terms.jsx';

function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const nav = useNavigate();
  const [user, setUser] = useState(currentUser);
  useEffect(() => {
    const t = setInterval(() => setUser(JSON.parse(localStorage.getItem('user') || 'null')), 500);
    return () => clearInterval(t);
  }, []);

  if (!user) return null;

  const topLinks = [
    { to: '/', icon: <DashboardIcon />, label: 'Overview', end: true },
    { to: '/crm', icon: <PeopleIcon />, label: 'Rental CRM' },
    { to: '/team', icon: <UsersIcon />, label: 'Managers & Teams' },
    { to: '/users', icon: <UsersIcon />, label: 'Users' },
    { to: '/cars', icon: <CarIcon />, label: 'Car Approvals' },
    { to: '/kyc', icon: <ShieldIcon />, label: 'KYC Queue' },
  ];
  const bottomLinks = [
    { to: '/payouts', icon: <WalletIcon />, label: 'Payouts' },
    { to: '/disputes', icon: <AlertIcon />, label: 'Disputes' },
    { to: '/agents', icon: <PeopleIcon />, label: 'Agents' },
    { to: '/settings', icon: <SettingsIcon />, label: 'Settings' },
  ];

  return (
    <>
      <div className={`sidebar-overlay ${mobileOpen ? 'visible' : ''}`} onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar dark ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}><ChevronLeft /></button>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">CR</div>
          <div className="sidebar-logo-text">
            <h2>ControlRoom</h2>
            <span>Super Admin</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-section-label">Core</p>
          {topLinks.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}>
              {l.icon}<span className="sidebar-link-text">{l.label}</span>
            </NavLink>
          ))}
          <p className="sidebar-section-label sidebar-section-spacer">Finance & Ops</p>
          {bottomLinks.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}>
              {l.icon}<span className="sidebar-link-text">{l.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-avatar">{user.name?.[0] || 'A'}</div>
          <div className="sidebar-user-info">
            <div className="name">{user.name}</div>
            <div className="role">Super Admin</div>
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
  const titles = { '/crm': 'Rental CRM', '/team': 'Managers & Teams', '/': 'Dashboard Overview', '/users': 'User Management', '/cars': 'Car Approvals', '/kyc': 'KYC Review Queue', '/payouts': 'Payout Management', '/disputes': 'Dispute Resolution', '/agents': 'Agent Management', '/settings': 'Platform Settings' };
  return (
    <div className="topbar">
      <button className="topbar-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)}><MenuIcon /></button>
      <span className="topbar-title">{titles[location.pathname] || 'ControlRoom'}</span>
      <div className="topbar-actions" />
    </div>
  );
}

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState(currentUser);
  const location = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setUser(JSON.parse(localStorage.getItem('user') || 'null')), 500);
    return () => clearInterval(t);
  }, []);

  const isAuth = location.pathname === '/login';

  if (!user && !isAuth) {
    return (
      <Routes>
        <Route path="/terms" element={<Terms brand="ControlRoom" backTo="/login" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (user && isAuth) {
    return <Navigate to="/" replace />;
  }

  if (isAuth) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/terms" element={<Terms brand="ControlRoom" backTo="/login" />} />
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
            <Route path="/" element={<Overview />} />
            <Route path="/crm" element={<CrmWorkspace />} />
            <Route path="/team" element={<CrmTeam />} />
            <Route path="/users" element={<Users />} />
            <Route path="/cars" element={<CarQueue />} />
            <Route path="/kyc" element={<KycQueue />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/payouts" element={<Payouts />} />
            <Route path="/disputes" element={<Disputes />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/terms" element={<Terms brand="ControlRoom" backTo="/" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
