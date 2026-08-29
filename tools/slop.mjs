import { config, initial, apply, moves } from '../src/game/royale.rules.mjs';
import { evaluate, competent, mulberry32 } from '../src/game/royale.ai.mjs';
import { PLANS, play } from './strategies.mjs';

const cfg = config();
const O = PLANS.balanced;

// Picks at random from every move within `slack` pawns of the best one. If
// those moves really are interchangeable this should cost nothing.
function sloppy(slack) {
  return (s, rng) => {
    const me = s.turn, mine = moves(s);
    if (!mine.length) return null;
    const term = (st) => st.over
      ? (st.over.winner === me ? 1e6 : st.over.winner === null ? 0 : -1e6)
      : evaluate(st, me, O);
    const scored = mine.map((mv) => {
      const a = apply(s, mv);
      if (a.over) return [mv, term(a)];
      const t = moves(a);
      return [mv, t.length ? Math.min(...t.map((r) => term(apply(a, r)))) : term(a)];
    });
    const best = Math.max(...scored.map((x) => x[1]));
    const pool = scored.filter((x) => x[1] >= best - slack * 10);
    return pool[(rng() * pool.length) | 0][0];
  };
}

const sharp = competent(O);
const G = Number(process.argv[2] ?? 40);
console.log(`\nSharp play vs play that takes any move within N pawns of best — ${G} games each\n`);
for (const slack of [0.5, 1, 2, 4]) {
  const loose = sloppy(slack);
  let w = 0, d = 0;
  for (let g = 0; g < G; g++) {
    const sw = g % 2 === 1;
    const s = play(cfg, sw ? loose : sharp, sw ? sharp : loose, 6100 + g);
    const win = s.over?.winner;
    if (win === null || win === undefined) d++;
    else if (win === (sw ? 1 : 0)) w++;
  }
  console.log(`  within ${String(slack).padStart(3)} pawn(s)   sharp wins ${Math.round((100 * (w + d / 2)) / G)}%`);
}
console.log('');
