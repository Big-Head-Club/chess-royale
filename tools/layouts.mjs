import { config, initial, apply, VALUE, ringOf, lifespan } from '../src/game/royale.rules.mjs';
import { competent, randomBot, mulberry32, TUNED } from './bots.mjs';

// All on size 9 (indices 0..8, centre 4,4). Collapses end rounds 4 and 7, so
// ring 0 dies at 4, ring 1 dies at 7, ring 2+ survives to the end.
export const L = {
  // Unique top prize on the permanently safe centre square.
  queen_centre: [[4, 4, 'Q'], [1, 5, 'R'], [7, 3, 'R'], [2, 6, 'N'], [6, 2, 'N'], [3, 3, 'B'], [5, 5, 'B']],
  // No unique best. Rooks are the top prize, mirrored, on ring 1 — they expire
  // at round 7, so each is a commitment you cannot walk back.
  paired_rooks: [[1, 5, 'R'], [7, 3, 'R'], [2, 6, 'N'], [6, 2, 'N'], [3, 3, 'B'], [5, 5, 'B']],
  // Same, but the top prize sits deep in the OTHER seat's half: the near chest
  // is cheap, the good one is behind enemy lines.
  crossed: [[2, 7, 'R'], [6, 1, 'R'], [1, 5, 'N'], [7, 3, 'N'], [3, 3, 'B'], [5, 5, 'B']],
  // Everything expires: all six chests on ring 1, dead by round 7.
  all_timed: [[1, 3, 'R'], [7, 5, 'R'], [1, 5, 'N'], [7, 3, 'N'], [3, 1, 'B'], [5, 7, 'B']],
};

const royale = competent(TUNED);
const noroute = competent({ ...TUNED, wChest: 0 });
const rnd = randomBot();

function play(cfg, a, b, seed) {
  const rng = mulberry32(seed);
  let s = initial(cfg);
  const popped = [[], []], bots = [a, b];
  for (let n = 0; !s.over && n < 500; n++) {
    const mv = bots[s.turn](s, rng);
    if (mv) { const ch = s.chests[mv.to]; if (ch && s.board[mv.from].t === 'r') popped[s.turn].push(ch); }
    s = apply(s, mv);
  }
  return { s, popped };
}

function winRate(cfg, a, b, games) {
  let w = 0;
  for (let g = 0; g < games; g++) {
    const swap = g % 2 === 1;
    const { s } = play(cfg, swap ? b : a, swap ? a : b, 3300 + g);
    if (s.over?.winner === (swap ? 1 : 0)) w++;
  }
  return (100 * w) / games;
}

function row(name, layout, games, over = {}) {
  const cfg = config({ size: 9, runnerStep: 2, layout, ...over });
  const top = layout.reduce((m, c) => Math.max(m, VALUE[c[2]]), 0);
  let cap = 0, col = 0, promo = 0, rounds = 0, draws = 0, dec = [0, 0], both = 0;
  for (let g = 0; g < games; g++) {
    const { s, popped } = play(cfg, royale, royale, 8800 + g);
    cap += s.killed.capture; col += s.killed.collapse; rounds += s.round;
    promo += popped[0].length + popped[1].length;
    const win = s.over?.winner;
    if (win === null || win === undefined) draws++;
    const has = [0, 1].map((c) => popped[c].some((t) => VALUE[t] === top));
    if (has[0] && has[1]) both++;
    const only = has[0] !== has[1] ? (has[0] ? 0 : 1) : -1;
    if (only >= 0 && win !== null && win !== undefined) { dec[1]++; if (win === only) dec[0]++; }
  }
  const f = (n) => (n / games).toFixed(1).padStart(4);
  console.log(
    `${name.padEnd(14)} cap ${f(cap)}  ring ${f(col)}  promo ${f(promo)}  rnd ${f(rounds)}` +
    `  draw ${((100 * draws) / games).toFixed(0).padStart(3)}%` +
    `  both-got-top ${String(Math.round((100 * both) / games)).padStart(3)}%` +
    `  sole-top wins ${dec[1] ? String(Math.round((100 * dec[0]) / dec[1])).padStart(3) + '%' : ' — '}(n=${String(dec[1]).padStart(2)})` +
    `  vs-noroute ${winRate(cfg, royale, noroute, games).toFixed(0).padStart(3)}%` +
    `  vs-random ${winRate(cfg, royale, rnd, games).toFixed(0).padStart(3)}%`
  );
}

const g = Number(process.argv[2] ?? 30);
console.log(`\nsize 9, runner step 2, ${g} games per layout\n`);
for (const [k, v] of Object.entries(L)) row(k, v, g);
console.log('');
