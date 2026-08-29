import { config, initial, apply, moves } from '../src/game/royale.rules.mjs';
import { competent, randomBot, mulberry32 } from '../src/game/royale.ai.mjs';

// Six honestly different plans a person might actually bring to this board.
export const PLANS = {
  balanced: { wChest: 2, wSafe: 0.15 },
  rookrush: { wChest: 6, wSafe: 0, only: 'R' },
  nearest:  { wChest: 4, wSafe: 0.15, flat: true },
  cautious: { wChest: 1.5, wSafe: 0.9 },
  hunter:   { wChest: 0, wSafe: 0.15, wAggro: 6 },
  turtle:   { wChest: 0.5, wSafe: 0.3, wCentre: 5 },
};

const BOT = Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, competent(v)]));
BOT.random = randomBot();

export function play(cfg, a, b, seed) {
  const rng = mulberry32(seed);
  let s = initial(cfg);
  const bots = [a, b];
  for (let n = 0; !s.over && n < 600; n++) s = apply(s, bots[s.turn](s, rng));
  return s;
}

if (process.argv[1]?.endsWith('strategies.mjs')) {
const cfg = config();
const names = Object.keys(PLANS);
const games = Number(process.argv[2] ?? 24);

const score = Object.fromEntries(names.map((n) => [n, 0]));
const cell = {};
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const [A, B] = [names[i], names[j]];
    let w = 0, d = 0;
    for (let g = 0; g < games; g++) {
      const sw = g % 2 === 1;                       // swap seats, turn order cancels
      const s = play(cfg, sw ? BOT[B] : BOT[A], sw ? BOT[A] : BOT[B], 2400 + g);
      const win = s.over?.winner;
      if (win === null || win === undefined) d++;
      else if (win === (sw ? 1 : 0)) w++;
    }
    const rateA = (w + d / 2) / games;
    cell[A + '|' + B] = rateA;
    cell[B + '|' + A] = 1 - rateA;
    score[A] += rateA; score[B] += 1 - rateA;
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log('\nStrategy round robin — cell is the ROW plan\'s win rate against the COLUMN plan');
console.log(`${games} games per pairing, seats swapped every other game\n`);
console.log(pad('', 10) + names.map((n) => pad(n, 10)).join('') + 'overall');
for (const A of names) {
  const row = names.map((B) => pad(A === B ? '—' : Math.round(100 * cell[A + '|' + B]) + '%', 10)).join('');
  console.log(pad(A, 10) + row + Math.round((100 * score[A]) / (names.length - 1)) + '%');
}

// Does the strongest plan actually beat a plain material player and a random one?
console.log('');
for (const A of names) {
  let w = 0;
  for (let g = 0; g < games; g++) {
    const sw = g % 2 === 1;
    if (play(cfg, sw ? BOT.random : BOT[A], sw ? BOT[A] : BOT.random, 900 + g).over?.winner === (sw ? 1 : 0)) w++;
  }
  console.log(`${pad(A, 10)} vs random ${Math.round((100 * w) / games)}%`);
}
console.log('');
}
