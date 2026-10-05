import ProfileDetails from '../../../../packages/shared/src/ProfileDetails.jsx';
import '../auth.css';

/** Agent portal: agents have no KYC page, so details lead to the dashboard. */
export default function AgentProfileDetails() {
  return <ProfileDetails next="/" />;
}
