import ProfileDetails from '../../../../packages/shared/src/ProfileDetails.jsx';
import '../auth.css';

/** Renter portal: profile details come before KYC in the signup funnel. */
export default function RenterProfileDetails() {
  return <ProfileDetails next="/kyc" />;
}
