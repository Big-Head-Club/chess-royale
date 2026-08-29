import { config, initial, apply, moves } from '../src/game/royale.rules.mjs';
import { competent, evaluate, mulberry32 } from '../src/game/royale.ai.mjs';
import { PLANS, play } from './strategies.mjs';

const cfg = config();
const TUNED = PLANS.balanced;
const bot = competent(TUNED);
const G = Number(process.argv[2] ?? 60);

// 1. Does the seat that moves first just win?
let first = 0, second = 0, drew = 0;
for (let g = 0; g < G; g++) {
  const w = play(cfg, bot, bot, 1700 + g).over?.winner;
  if (w === 0) first++; else if (w === 1) second++; else drew++;
}
console.log(`\nFirst-player advantage   seat 1 ${Math.round((100 * first) / G)}%   seat 2 ${Math.round((100 * second) / G)}%   draw ${Math.round((100 * drew) / G)}%`);

// 2. Is the opening scripted? Fingerprint each side's first three moves.
const openings = new Map();
for (let g = 0; g < G; g++) {
  const rng = mulberry32(5000 + g);
  let s = initial(cfg);
  const seq = [];
  while (s.turn === 0 && !s.over) { const m = bot(s, rng); seq.push(m.from + '>' + m.to); s = apply(s, m); }
  const k = seq.join(' ');
  openings.set(k, (openings.get(k) ?? 0) + 1);
}
const top = [...openings.entries()].sort((a, b) => b[1] - a[1]);
console.log(`Distinct opening turns   ${openings.size} of ${G} games   most common played ${Math.round((100 * top[0][1]) / G)}% of the time`);

// 3. How often does the choice actually matter? Compare the best move's score
//    to the second-best DISTINCT score at every position the bot faces.
function spread(s) {
  const me = s.turn;
  const scored = moves(s).map((mv) => {
    const a = apply(s, mv);
    if (a.over) return a.over.winner === me ? 1e6 : a.over.winner === null ? 0 : -1e6;
    const t = moves(a);
    return t.length ? Math.min(...t.map((r) => {
      const b = apply(a, r);
      return b.over ? (b.over.winner === me ? 1e6 : b.over.winner === null ? 0 : -1e6) : evaluate(b, me, TUNED);
    })) : evaluate(a, me, TUNED);
  }).sort((x, y) => y - x);
  if (scored.length < 2) return null;
  const best = scored[0];
  const ties = scored.filter((v) => v > best - 1e-9).length;
  const next = scored.find((v) => v < best - 1e-9);
  return { ties, options: scored.length, gap: next === undefined ? 0 : best - next };
}

let forced = 0, live = 0, wide = 0, n = 0, tieSum = 0, optSum = 0;
for (let g = 0; g < 12; g++) {
  const rng = mulberry32(3100 + g);
  let s = initial(cfg);
  while (!s.over) {
    const sp = spread(s);
    if (sp) {
      n++; tieSum += sp.ties; optSum += sp.options;
      // A gap of 10 is one pawn of material — below that the runner-up is a
      // real alternative, not a blunder.
      if (sp.gap > 40) forced++; else if (sp.gap > 10) live++; else wide++;
    }
    s = apply(s, bot(s, rng));
  }
}
console.log(`\nPositions examined       ${n}`);
console.log(`  one move clearly best  ${Math.round((100 * forced) / n)}%   (runner-up is 4+ pawns worse — the move plays itself)`);
console.log(`  a real decision        ${Math.round((100 * live) / n)}%   (runner-up 1-4 pawns worse)`);
console.log(`  near-equal options     ${Math.round((100 * wide) / n)}%   (runner-up within a pawn)`);
console.log(`  average legal moves    ${(optSum / n).toFixed(1)}, of which ${(tieSum / n).toFixed(1)} score identically\n`);
