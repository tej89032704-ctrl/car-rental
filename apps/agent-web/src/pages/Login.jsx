import AuthPage from '../../../../packages/shared/src/AuthPage.jsx';

/**
 * AgentField sign-in. Same staff rules as ControlRoom: accounts are
 * provisioned rather than self-served, and the API keeps agent credentials on
 * /auth/agent/login — posting them to /auth/login answers 401 because the
 * 'agent' role does not belong to the main portal. `forgotHref` is omitted
 * because this portal has no /forgot-password route.
 */
export default function Login() {
  return (
    <AuthPage
      view="in"
      brand="AgentField"
      portal="agent"
      roles={['agent']}
      defaultRole="agent"
      termsHref="/terms"
      home="/"
    />
  );
}
