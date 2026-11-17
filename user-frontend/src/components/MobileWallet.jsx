import { useAuth } from '../context/AuthContext.jsx';
import { UserIcon, PiggyIcon, PointPIcon } from './Icons.jsx';

function formatAmount(value) {
  return Number(value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Wallet summary shown only on mobile, above Game of the Week, so it never
// crowds the header logo. Renders nothing when signed out.
export default function MobileWallet() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="mwallet">
      <span className="mwallet__item">
        <UserIcon width={16} height={16} className="wallet__ico--name" />
        {user.name}
      </span>
      <span className="mwallet__item">
        <PiggyIcon width={17} height={17} className="wallet__ico--balance" />
        {formatAmount(user.balance)}
      </span>
      <span className="mwallet__item">
        <PointPIcon width={17} height={17} className="wallet__ico--point" />
        {formatAmount(user.point)}
      </span>
    </div>
  );
}
