import Banner from '../components/Banner.jsx';
import Footer from '../components/Footer.jsx';
import CasinoSections from '../components/CasinoSections.jsx';

// /casino — the casino lobby: main banner image plus the same Hot Games / Slots /
// Live Casino rows as the home page.
export default function CasinoLobbyPage() {
  return (
    <>
      <Banner />
      <CasinoSections />
      <Footer />
    </>
  );
}
