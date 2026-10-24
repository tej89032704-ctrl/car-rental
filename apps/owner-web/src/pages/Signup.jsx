import SignupSplit from '../../../../packages/shared/src/SignupSplit.jsx';

/**
 * Owner portal: this page creates car owners only. The renter half of the
 * funnel belongs to the renter portal, so the page links across to it instead
 * of offering a role toggle that would land the visitor in the wrong account
 * type.
 */
export default function Signup() {
  return <SignupSplit portal="owner" />;
}
