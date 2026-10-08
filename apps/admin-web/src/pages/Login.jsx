import AuthPage from '../../../../packages/shared/src/AuthPage.jsx';

/**
 * ControlRoom sign-in.
 *
 * Two things differ from the renter/owner pages and both were previously
 * wrong: the role toggle offered "Rent a car / List my car" (staff have no
 * such choice) and the request went to /auth/login, which the API rejects
 * with 401 for a super_admin no matter how correct the password is. The
 * `portal` prop selects /auth/admin/login, which answers with a 2FA
 * challenge that AuthPage collects a code for.
 *
 * `forgotHref` is deliberately omitted — this portal has no
 * /forgot-password route, so the link would only bounce back here.
 */
export default function Login() {
  return (
    <AuthPage
      view="in"
      brand="ControlRoom"
      portal="admin"
      roles={['admin']}
      defaultRole="admin"
      termsHref="/terms"
      home="/"
    />
  );
}
