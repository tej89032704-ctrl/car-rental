import { currentUser } from '../api.js';
import KycVerify from '../../../../packages/shared/src/KycVerify.jsx';

export default function Kyc() {
  if (!currentUser) return <div className="alert info">Login first.</div>;
  return (
    <div className="wrap">
      <KycVerify variant="owner" />
    </div>
  );
}
