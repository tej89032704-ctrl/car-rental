import SignupSplit from '../../../../packages/shared/src/SignupSplit.jsx';

/**
 * Renter portal: this page creates car renters only. The "List my car" half of
 * the funnel belongs to the owner portal, so the page links across to it
 * instead of offering a role toggle that would land the visitor in the wrong
 * account type.
 */
export default function Signup() {
  return <SignupSplit portal="renter" />;
}
