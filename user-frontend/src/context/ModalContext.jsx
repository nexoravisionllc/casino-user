import { createContext, useContext, useState } from 'react';

// Controls the auth modal. mode is null (closed), 'signin' or 'signup'.
const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [mode, setMode] = useState(null);

  const openSignIn = () => setMode('signin');
  const openSignUp = () => setMode('signup');
  const close = () => setMode(null);

  return (
    <ModalContext.Provider value={{ mode, openSignIn, openSignUp, close }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within a ModalProvider');
  return ctx;
}
