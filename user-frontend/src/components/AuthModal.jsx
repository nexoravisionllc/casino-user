import { useEffect, useState } from 'react';
import { useModal } from '../context/ModalContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { CloseIcon, EyeIcon } from './Icons.jsx';

// Fields mirror the database structure (design only for Sign Up).
const emptySignup = {
  name: '', loginId: '', password: '', confirmPassword: '',
  referralId: '', email: '', bankName: '', bankAccount: '', bankMaster: '',
};

export default function AuthModal() {
  const { mode, openSignIn, openSignUp, close } = useModal();
  const { login, register } = useAuth();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [signup, setSignup] = useState(emptySignup);

  // Reset transient state whenever the modal opens or switches tab.
  useEffect(() => {
    setError('');
    setNotice('');
    setPassword('');
    setShowPw(false);
  }, [mode]);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (mode) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [mode]);

  if (!mode) return null;

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(loginId.trim(), password);
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateSignup = (key) => (e) => setSignup((f) => ({ ...f, [key]: e.target.value }));

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!signup.name.trim() || !signup.loginId.trim() || !signup.password) {
      setError('Name, login ID and password are required.');
      return;
    }
    if (signup.password !== signup.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    // Referral ID is optional: a blank referral attaches the account to the admin.
    setLoading(true);
    try {
      const res = await register(signup);
      if (res?.ok) {
        setSignup(emptySignup);
        setNotice(res.message || 'Your sign-up request has been submitted and is pending approval.');
      } else {
        setError(res?.message || 'Sign-up failed. Please try again.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={close} aria-label="Close">
          <CloseIcon width={18} height={18} />
        </button>

        {/* Left promotional panel */}
        <div className="modal__promo">
          <img className="modal__team" src="/assets/hero.jpg" alt="" />
          <img className="modal__crown" src="/assets/logo-mark.svg" alt="" />
          <h3>Welcome to<br />Nexora Vision Play</h3>
          <p>Thousands of slots and hot games — all in one place.</p>
        </div>

        {/* Right form panel */}
        <div className="modal__body">
          <div className="modal__tabs">
            <button
              className={`modal__tab ${mode === 'signin' ? 'is-active' : ''}`}
              onClick={openSignIn}
            >
              Sign In
            </button>
            <button
              className={`modal__tab ${mode === 'signup' ? 'is-active' : ''}`}
              onClick={openSignUp}
            >
              Sign Up
            </button>
          </div>

          {mode === 'signin' ? (
            <form className="auth-form" onSubmit={handleSignIn}>
              <label className="field">
                <span className="field__label">Login ID</span>
                <input
                  className="field__input"
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="Enter your login ID"
                  autoComplete="username"
                  required
                />
              </label>

              <label className="field">
                <span className="field__label">Password</span>
                <div className="field__pw">
                  <input
                    className="field__input"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                  <button type="button" className="field__eye" onClick={() => setShowPw((v) => !v)} aria-label="Toggle password">
                    <EyeIcon width={18} height={18} />
                  </button>
                </div>
              </label>

              {error && <p className="auth-error">{error}</p>}

              <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>

              <p className="auth-switch">
                Don’t have an account? <button type="button" className="linklike" onClick={openSignUp}>Sign Up</button>
              </p>
            </form>
          ) : (
            <form className="auth-form auth-form--grid" onSubmit={handleSignUp}>
              <label className="field"><span className="field__label">Name</span>
                <input className="field__input" value={signup.name} onChange={updateSignup('name')} placeholder="Display name" /></label>
              <label className="field"><span className="field__label">Login ID</span>
                <input className="field__input" value={signup.loginId} onChange={updateSignup('loginId')} placeholder="Login ID" /></label>
              <label className="field"><span className="field__label">Password</span>
                <input className="field__input" type="password" value={signup.password} onChange={updateSignup('password')} placeholder="Password" /></label>
              <label className="field"><span className="field__label">Confirm Password</span>
                <input className="field__input" type="password" value={signup.confirmPassword} onChange={updateSignup('confirmPassword')} placeholder="Re-enter password" /></label>
              <label className="field"><span className="field__label">Referral ID</span>
                <input className="field__input" value={signup.referralId} onChange={updateSignup('referralId')} placeholder="Referral ID (optional)" /></label>
              <label className="field"><span className="field__label">Email</span>
                <input className="field__input" type="email" value={signup.email} onChange={updateSignup('email')} placeholder="you@example.com" /></label>
              <label className="field"><span className="field__label">Bank Name</span>
                <input className="field__input" value={signup.bankName} onChange={updateSignup('bankName')} placeholder="Bank name" /></label>
              <label className="field"><span className="field__label">Bank Account</span>
                <input className="field__input" value={signup.bankAccount} onChange={updateSignup('bankAccount')} placeholder="Account number" /></label>
              <label className="field field--full"><span className="field__label">Depositor</span>
                <input className="field__input" value={signup.bankMaster} onChange={updateSignup('bankMaster')} placeholder="Depositor name" /></label>

              {error && <p className="auth-error field--full">{error}</p>}
              {notice && <p className="auth-notice field--full">{notice}</p>}

              <button className="btn btn--primary btn--block field--full" type="submit" disabled={loading}>
                {loading ? 'Creating…' : 'Create Account'}
              </button>
              <p className="auth-switch field--full">
                Already have an account? <button type="button" className="linklike" onClick={openSignIn}>Sign In</button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
