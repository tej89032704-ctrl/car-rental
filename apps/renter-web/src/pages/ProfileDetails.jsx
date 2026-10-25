import SharedProfileDetails from '../../../../packages/shared/src/ProfileDetails.jsx';
import '../auth.css';
import '../profile-details.css';

/**
 * Renter portal: profile details come before KYC in the signup funnel.
 *
 * The shared component ships its own auth chrome for the owner and agent
 * portals, which is a flat dark shell -- inside this portal that read as a
 * white card on a black page with an invisible heading. Wrapping it in `.ce`
 * puts it on the artwork's warm background and, because car-ent.css styles
 * .btn / input.f / .alert.err under that scope, gives the form the portal's
 * controls too. profile-details.css only re-points the auth classes; the
 * shared component itself is untouched.
 */
export default function RenterProfileDetails() {
  return (
    <div className="ce pd">
      <div className="ce-bg" aria-hidden="true"><i /><i /></div>
      <div className="pd-wrap">
        <div className="pd-brand">CAR<i>·</i>ENT</div>
        <SharedProfileDetails next="/kyc" />
      </div>
    </div>
  );
}
