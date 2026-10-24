import VerifyPhone from '../../../../packages/shared/src/VerifyPhone.jsx';

/**
 * Renter portal: confirm the phone number collected at signup.
 *
 * The screen is skippable — the account is already active and KYC is the gate
 * that matters — so this is a nudge towards a number we can text, not a wall.
 */
export default function VerifyOtp() {
  return <VerifyPhone portal="renter" brand="CAR-ENT" next="/profile-details" />;
}
