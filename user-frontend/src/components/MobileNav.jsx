import { Link } from 'react-router-dom';
import { useModal } from '../context/ModalContext.jsx';
import { MenuIcon, FireIcon, HomeIcon, SlotsIcon, ChatIcon } from './Icons.jsx';

// Bottom navigation bar for mobile. This is the home page, so the elevated
// center item is Home (active). Order: Menu, Hot Games, Home, Slots, Chat.
export default function MobileNav({ onOpenMenu }) {
  const { openSignIn } = useModal();

  return (
    <nav className="bottomnav">
      <button className="bottomnav__item" onClick={onOpenMenu}>
        <MenuIcon width={22} height={22} />
        <span>Menu</span>
      </button>
      <Link to="/hotgame" className="bottomnav__item">
        <FireIcon width={22} height={22} />
        <span>Hot</span>
      </Link>
      <Link to="/" className="bottomnav__item bottomnav__item--center">
        <span className="bottomnav__center">
          <HomeIcon width={24} height={24} />
        </span>
        <span>Home</span>
      </Link>
      <Link to="/slot" className="bottomnav__item">
        <SlotsIcon width={22} height={22} />
        <span>Slots</span>
      </Link>
      <button className="bottomnav__item" onClick={openSignIn}>
        <ChatIcon width={22} height={22} />
        <span>Chat</span>
      </button>
    </nav>
  );
}
