// Sample game catalog built from the local thumbnail assets.
// These drive the horizontally scrolling rows on the home page.
import { topGames } from './topGames.js';

const providers = ['Evolution', 'Pragmatic', 'Hacksaw', 'NoLimit', 'BC Originals', 'Play’n GO'];

function thumb(n) {
  return `/assets/thumb${String(n).padStart(2, '0')}.avif`;
}

const titles = [
  'Sweet Bonanza', 'Gates of Olympus', 'Sugar Rush', 'Big Bass', 'Mental',
  'Wanted Dead', 'Lightning Baccarat', 'Crazy Time', 'Money Train', 'Book of Dead',
  'Starburst', 'Fruit Party', 'The Dog House', 'Wolf Gold', 'Reactoonz',
  'Dead or Alive', 'Gonzo’s Quest', 'Bonanza', 'Aviator', 'Plinko',
  'Blackjack VIP', 'Roulette Live', 'Dream Catcher', 'Mega Ball', 'Gems Bonanza',
  'Wild West Gold', 'Buffalo King', 'Fire Joker',
];

function build(count, offset = 0) {
  return Array.from({ length: count }, (_, i) => {
    const idx = ((offset + i) % 28) + 1;
    return {
      id: `${offset}-${i}`,
      title: titles[(offset + i) % titles.length],
      provider: providers[(offset + i) % providers.length],
      img: thumb(idx),
      players: 20 + ((offset + i) * 37) % 3000,
    };
  });
}

// Hot Games are now fetched from the front backend (GET /api/games/hot) in Home.jsx.
export const liveCasino = build(14, 6);
// Slots are now fetched from the front backend (GET /api/games/slots) in Home.jsx.
// Game of the Week — hardcoded from our Games DB (image, name, review, provider).
// The card's number badge shows the review count. Same layout as the other rows.
const PP_IMG = 'https://ppresource.opgtrnksbr.net/ppgame/game_pic';
export const gameOfWeek = [
  { id: 'gw-1', title: 'Hell Butcher', provider: 'Pragmatic Play', players: 875, img: `${PP_IMG}/vs20multcann.png` },
  { id: 'gw-2', title: 'Fury of Anubis', provider: 'Pragmatic Play', players: 9214, img: `${PP_IMG}/vs20wraanu.png` },
  { id: 'gw-3', title: 'Better Barn House Bonanza', provider: 'Pragmatic Play', players: 728, img: `${PP_IMG}/vswaysbibebarn.png` },
  { id: 'gw-4', title: 'Bear Crazy', provider: 'Pragmatic Play', players: 288, img: `${PP_IMG}/vs20bigbbear.png` },
  { id: 'gw-5', title: "Joker's Revenge", provider: 'Pragmatic Play', players: 770, img: `${PP_IMG}/vs5jkrrevenge.png` },
  { id: 'gw-6', title: 'Mahjong Wins Triple Pot', provider: 'Pragmatic Play', players: 9220, img: `${PP_IMG}/vswaysmajhng3p.png` },
  { id: 'gw-7', title: 'Sanatorium Secrets', provider: 'Pragmatic Play', players: 9562, img: `${PP_IMG}/vswayssanator.png` },
  { id: 'gw-8', title: "Caishen's Cash Pots", provider: 'Pragmatic Play', players: 8880, img: `${PP_IMG}/vsways4ptgld.png` },
  { id: 'gw-9', title: 'Candy Rush', provider: 'Pragmatic Play', players: 9635, img: `${PP_IMG}/vs20candyia.png` },
  { id: 'gw-10', title: 'Big Bass Football Bonanza', provider: 'Pragmatic Play', players: 160, img: `${PP_IMG}/vs10bbwcup.png` },
  { id: 'gw-11', title: "Dragon's Gate-Bonus Choice", provider: 'Pragmatic Play', players: 329, img: `${PP_IMG}/vs50dragatebch.png` },
  { id: 'gw-12', title: 'The Big Dog House', provider: 'Pragmatic Play', players: 4740, img: `${PP_IMG}/vs20bgdoghouse.png` },
  { id: 'gw-13', title: 'Heartbreakers', provider: 'Pragmatic Play', players: 463, img: `${PP_IMG}/vs20prizegrow.png` },
  { id: 'gw-14', title: "Mr.Null's Wicked Wares", provider: 'Pragmatic Play', players: 8984, img: `${PP_IMG}/vswaysmrcursc.png` },
  { id: 'gw-15', title: 'Launch to Riches', provider: 'Pragmatic Play', players: 109, img: `${PP_IMG}/vswaysrocktrls.png` },
  { id: 'gw-16', title: 'Great Ghosts!', provider: 'Pragmatic Play', players: 8468, img: `${PP_IMG}/vs50grghsts.png` },
  { id: 'gw-17', title: 'Sweet Bonanza 2500', provider: 'Pragmatic Play', players: 9843, img: `${PP_IMG}/vs20swbon2500.png` },
  { id: 'gw-18', title: 'Dragon Pots Megaways', provider: 'Pragmatic Play', players: 8200, img: `${PP_IMG}/vswaysdragden.png` },
];

// Recent Big Wins: the top 100 games by popularity, with random USD win amounts.
const usdAmount = () =>
  (Math.random() * 49900 + 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const bigWins = topGames.map((g, i) => ({
  id: `win-${i}`,
  title: g.title,
  img: g.img,
  player: `player_${Math.floor(Math.random() * 90000) + 10000}`,
  amount: usdAmount(),
  currency: 'USD',
  category: 'Slots',
}));
