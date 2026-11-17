import Banner from '../components/Banner.jsx';
import Footer from '../components/Footer.jsx';
import { GameOfWeek, RecentBigWins, GameCategories } from '../components/FeaturedSections.jsx';
import MobileWallet from '../components/MobileWallet.jsx';
import CasinoSections from '../components/CasinoSections.jsx';

export default function Home() {
  return (
    <>
      {/* Hero banner (Sign Up only) */}
      <Banner />

      {/* Mobile-only wallet summary, above Game of the Week */}
      <MobileWallet />

      {/* Featured content */}
      <GameOfWeek />
      <RecentBigWins />

      {/* Casino / Sports category tiles */}
      <GameCategories />

      {/* Hot Games / Live Casino / Slots rows (shared with the /casino lobby) */}
      <CasinoSections />

      <Footer />
    </>
  );
}
