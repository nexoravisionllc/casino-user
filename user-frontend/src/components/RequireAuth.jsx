import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useModal } from '../context/ModalContext.jsx';

/**
 * Guards account pages (deposit, withdraw, point convert, history). Without a
 * signed-in session the page is not shown: the user is sent back to the home
 * page and the sign-in modal opens. This also covers logging out while on a
 * guarded page — the token becomes null and the guard redirects.
 */
export default function RequireAuth({ children }) {
  const { token } = useAuth();
  const { openSignIn } = useModal();

  useEffect(() => {
    if (!token) openSignIn();
  }, [token, openSignIn]);

  if (!token) return <Navigate to="/" replace />;
  return children;
}
