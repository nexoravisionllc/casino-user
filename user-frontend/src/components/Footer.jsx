// Footer laid out like the reference: a top SEO block, four link columns,
// responsible-gaming badges and a bottom bar. Body copy is original.
const columns = [
  {
    title: 'Casino',
    links: ['Casino Home', 'Slots', 'Live Casino', 'New Releases', 'Recommended', 'Table Games', 'Blackjack', 'Roulette', 'Baccarat'],
  },
  {
    title: 'Sports',
    links: ['Sports Home', 'Live', 'Rules', 'Betting Insights'],
  },
  {
    title: 'Promo',
    links: ['VIP Club', 'Referral', 'Promotions', 'Lottery', 'Refer a Friend'],
  },
  {
    title: 'Support / Legal',
    links: ['Licenses', 'Help Center', 'Gamble Aware', 'Fairness', 'FAQ', 'Privacy Policy', 'Terms of Service', 'Responsible Gambling', 'AML'],
  },
];

export default function Footer() {
  return (
    <footer className="footer">
      {/* SEO / intro block */}
      <section className="footer__seo">
        <h2>Crypto Online Casino &amp; Sportsbook</h2>
        <p>
          Play thousands of slots, live dealer tables and original games, or bet
          on your favourite teams across a full sportsbook — all with fast crypto
          deposits and withdrawals. This site is a demo built with React and
          ASP.NET Core for development and learning purposes.
        </p>
      </section>

      <div className="footer__top">
        <div className="footer__brand">
          <img src="/assets/footer-logo.png" alt="BC Game" />
          <p>Play responsibly. You must be of legal age to gamble in your jurisdiction.</p>
          <div className="footer__coins">
            <img src="/assets/coin-btc.png" alt="BTC" />
            <img src="/assets/coin-eth.png" alt="ETH" />
            <img src="/assets/coin-usdt.png" alt="USDT" />
          </div>
        </div>

        <div className="footer__cols">
          {columns.map((c) => (
            <div className="footer__col" key={c.title}>
              <h4>{c.title}</h4>
              <ul>
                {c.links.map((l) => (
                  <li key={l}><a>{l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="footer__badges">
        <span className="footer__badge">18+</span>
        <span className="footer__badge">Responsible Gaming</span>
        <span className="footer__badge">Provably Fair</span>
        <span className="footer__badge">Licensed Demo</span>
      </div>

      <div className="footer__bottom">
        <span>© {new Date().getFullYear()} BC Game. All rights reserved.</span>
        <div className="footer__pay">
          <img src="/assets/pay-google.png" alt="Google Pay" />
          <img src="/assets/pay-apple.png" alt="Apple Pay" />
        </div>
      </div>
    </footer>
  );
}
