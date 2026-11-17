import Banner from '../components/Banner.jsx';
import Footer from '../components/Footer.jsx';
import CasinoSections from '../components/CasinoSections.jsx';

export default function Home() {
  return (
    <>
      {/* Hero banner (Sign Up only) */}
      <Banner />

      {/* Hot Games / Slots rows */}
      <CasinoSections />

      <Footer />
    </>
  );
}
