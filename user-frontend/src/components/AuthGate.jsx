import { useEffect } from 'react';
import { useModal } from '../context/ModalContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Opens the sign-in modal when a feature (e.g. launching a game) needs a
// logged-in user and dispatches an "auth:required" event. Also clears any
// stale/expired session so the header reflects the signed-out state.
export default function AuthGate() {
  const { openSignIn } = useModal();
  const { logout } = useAuth();
  useEffect(() => {
    const handler = () => { logout(); openSignIn(); };
    window.addEventListener('auth:required', handler);
    return () => window.removeEventListener('auth:required', handler);
  }, [openSignIn, logout]);
  return null;
}
