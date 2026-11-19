import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import SlotPage from './pages/SlotPage.jsx';
import ProvidersPage from './pages/ProvidersPage.jsx';
import ProviderGamesPage from './pages/ProviderGamesPage.jsx';
import HotGamePage from './pages/HotGamePage.jsx';
import DepositPage from './pages/DepositPage.jsx';
import WithdrawPage from './pages/WithdrawPage.jsx';
import PointConvertPage from './pages/PointConvertPage.jsx';
import TransactionPage from './pages/TransactionPage.jsx';
import AuthModal from './components/AuthModal.jsx';
import AuthGate from './components/AuthGate.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import WalletRealtime from './realtime/WalletRealtime.jsx';

export default function App() {
  return (
    <>
      {/* Layout (header + sidebar) is mounted once and persists across route
          changes; only the routed page content inside it swaps. */}
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/slot/*" element={<SlotPage />} />
          <Route path="/hotgame/*" element={<HotGamePage />} />
          <Route path="/providers" element={<ProvidersPage />} />
          <Route path="/providers/:name" element={<ProviderGamesPage />} />
          <Route path="/money/deposit" element={<RequireAuth><DepositPage /></RequireAuth>} />
          <Route path="/money/withdraw" element={<RequireAuth><WithdrawPage /></RequireAuth>} />
          <Route path="/money/point-convert" element={<RequireAuth><PointConvertPage /></RequireAuth>} />
          <Route path="/money/transaction" element={<RequireAuth><TransactionPage /></RequireAuth>} />
          {/* Auth now opens as a modal; legacy paths fall back to the home page. */}
          <Route path="*" element={<Home />} />
        </Routes>
      </Layout>
      <AuthModal />
      <AuthGate />
      <WalletRealtime />
    </>
  );
}
