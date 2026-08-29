import { initial, apply, moves, material, pieces, LAST_ROUND } from '../src/game/royale.rules.mjs';
import { BOTS, mulberry32 } from './bots.mjs';

export function playGame(botA, botB, seed) {
  const rng = mulberry32(seed);
  let s = initial();
  const bots = [botA, botB];
  let plies = 0;
  while (!s.over && plies < 400) {
    const mv = bots[s.turn](s, rng);
    if (!mv) {                       // no legal move: pass the turn
      s = apply(s, { from: -1, to: -1, pass: true });
      plies++; continue;
    }
    s = apply(s, mv);
    plies++;
  }
  return s;
}

function match(nameA, nameB, games) {
  let w = [0, 0, 0];               // A wins, B wins, draws
  let popped = 0, qPopped = 0, rounds = 0;
  for (let g = 0; g < games; g++) {
    // Swap seats every other game so turn order cancels out.
    const swap = g % 2 === 1;
    const a = BOTS[nameA], b = BOTS[nameB];
    const s = playGame(swap ? b : a, swap ? a : b, 1000 + g);
    const winner = s.over?.winner;
    if (winner === null || winner === undefined) w[2]++;
    else {
      const aIsSeat = swap ? 1 : 0;
      if (winner === aIsSeat) w[0]++; else w[1]++;
    }
    rounds += s.round;
    let live = 0, q = 0;
    for (const c of s.chests) { if (c) live++; if (c === 'Q') q++; }
    popped += 7 - live; qPopped += 1 - q;
  }
  const pct = (n) => ((100 * n) / games).toFixed(1).padStart(5);
  console.log(
    `${(nameA + ' vs ' + nameB).padEnd(22)} ` +
    `A ${pct(w[0])}%  B ${pct(w[1])}%  draw ${pct(w[2])}%  ` +
    `| avg round ${(rounds / games).toFixed(1)}  chests popped ${(popped / games).toFixed(1)}/7  queen ${(100 * qPopped / games).toFixed(0)}%`
  );
  return w;
}

if (process.argv[1]?.endsWith('duel.mjs')) {
const games = Number(process.argv[2] ?? 100);
console.log(`\n${games} games each, seats swapped every other game\n`);
match('royale', 'random', games);
match('royale', 'noroute', games);
match('royale', 'nosafety', games);
match('noroute', 'random', games);
console.log('');
}
