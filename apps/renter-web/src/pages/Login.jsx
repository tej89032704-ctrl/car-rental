import AuthPage from '../../../../packages/shared/src/AuthPage.jsx';
import SplitLoginHandoff from '../../../../packages/shared/src/SplitLoginHandoff.jsx';

/**
 * /login is the premium split login (public/login-split.html), served at this
 * URL by the `split-login` plugin in vite.config.js — so a real navigation to
 * /login never reaches this component.
 *
 * It still exists for in-app navigation: `<Link to="/login">` and the logout
 * button are client-side pushes that never touch the server, so this hands
 * that visitor over to the document instead of showing the older auth card.
 *
 * AuthPage remains the fallback only, and only after every handoff attempt has
 * failed. It cannot be deleted outright: it is still the signup screen
 * (Signup.jsx, view="up") and the admin, agent and manager logins, none of
 * which have a split-screen equivalent.
 */
export default function Login() {
  return (
    <SplitLoginHandoff
      storageKey="renter-login-handoff"
      fallback={
        <AuthPage view="in" brand="CAR-ENT" defaultRole="rent" forgotHref="/forgot-password" termsHref="/terms" home="/" />
      }
    />
  );
}
