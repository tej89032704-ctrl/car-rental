import VerifyPhone from '../../../../packages/shared/src/VerifyPhone.jsx';

/**
 * Owner portal: confirm the phone number collected at signup.
 *
 * Same shared screen as the renter portal, with the owner's wine scene and
 * listing preview in the right-hand panel.
 */
export default function VerifyOtp() {
  return <VerifyPhone portal="owner" brand="CAR-ENT" next="/profile-details" />;
}
