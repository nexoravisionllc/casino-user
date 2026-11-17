import { useAuth } from '../context/AuthContext.jsx';
import { useModal } from '../context/ModalContext.jsx';

// Hero banner rebuilt to match the reference screenshot: the crown "B" logo and
// "JOIN THE UNTAMED" on a dark stage, the esports team on the right, and a Sign
// Up call to action. The "Or Register With" (Google / Telegram) row is removed.
export default function Banner() {
  const { user } = useAuth();
  const { openSignUp } = useModal();

  return (
    <section className="banner">
      <div className="banner__inner">
        <div className="banner__content">
          <img className="banner__crown" src="/assets/banner-logo.png" alt="" />
          <h1 className="banner__title">JOIN THE UNTAMED</h1>
          {!user && (
            <button className="btn btn--primary banner__cta" onClick={openSignUp}>
              Sign Up
            </button>
          )}
        </div>
        {/* Desktop uses the full team; mobile uses the two-player image. */}
        <img className="banner__art banner__art--desktop" src="/assets/banner-team.png" alt="" />
        <img className="banner__art banner__art--mobile" src="/assets/banner-team-mobile.png" alt="" />
      </div>
    </section>
  );
}
