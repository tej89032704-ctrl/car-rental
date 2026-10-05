import ProfileDetails from '../../../../packages/shared/src/ProfileDetails.jsx';
import '../auth.css';

/** Owner portal: profile details come before KYC in the signup funnel. */
export default function OwnerProfileDetails() {
  return <ProfileDetails next="/kyc" />;
}
