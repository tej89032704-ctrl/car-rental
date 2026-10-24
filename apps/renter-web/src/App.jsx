import { useEffect, useState } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { sessionUser } from './api.js';
import PortalChrome from './components/PortalChrome.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import VerifyOtp from './pages/VerifyOtp.jsx';
import ProfileDetails from './pages/ProfileDetails.jsx';
import Search from './pages/Search.jsx';
import CarDetail from './pages/CarDetail.jsx';
import Enquiries from './pages/Enquiries.jsx';
import MyBookings from './pages/MyBookings.jsx';
import BookingDetail from './pages/BookingDetail.jsx';
import Kyc from './pages/Kyc.jsx';
import Notifications from './pages/Notifications.jsx';
import Reviews from './pages/Reviews.jsx';
import Lifetime from './pages/Lifetime.jsx';
import Profile from './pages/Profile.jsx';
import { ForgotPassword, ResetPassword } from './pages/Password.jsx';
import Terms from '../../../packages/shared/src/Terms.jsx';

export default function App() {
  const [, setUser] = useState(sessionUser);
  const location = useLocation();

  // Pages that render the auth shell instead of the portal chrome, split by
  // session requirement. /login and /signup are pointless once signed in, so
  // they bounce. /verify-otp and /profile-details are the opposite: they only
  // exist *because* a session exists (both call authenticated endpoints), so
  // they must not redirect an already-signed-in user away.
  const anonPages = ['/login', '/signup', '/forgot-password', '/reset-password'];
  const sessionPages = ['/verify-otp', '/profile-details'];
  const isAuth = anonPages.includes(location.pathname) || sessionPages.includes(location.pathname);

  // Read storage directly rather than trusting state: Signup calls
  // setSession() and then navigates in the same tick.
  const signedIn = !!sessionUser();

  useEffect(() => {
    const t = setInterval(() => setUser(JSON.parse(localStorage.getItem('user') || 'null')), 1000);
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

  if (!signedIn) {
    const isPublicBrowse = location.pathname === '/' || location.pathname.startsWith('/cars/') || location.pathname === '/terms';
    if (!isPublicBrowse) return <Navigate to="/login" replace />;
    return (
      <div className="ce">
        <PortalChrome guest />
        <div className="wrap">
          <Routes>
            <Route path="/" element={<Search />} />
            <Route path="/cars/:id" element={<CarDetail />} />
            <Route path="/terms" element={<Terms brand="CAR-ENT" backTo="/" />} />
          </Routes>
        </div>
      </div>
    );
  }

  return (
    <div className="ce">
      <PortalChrome />
      <div className="wrap">
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/cars/:id" element={<CarDetail />} />
          <Route path="/enquiries" element={<Enquiries />} />
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
    </div>
  );
}
