import { config, initial, apply, moves } from '../src/game/royale.rules.mjs';
import { L } from './layouts.mjs';
import { competent, randomBot, mulberry32, TUNED } from './bots.mjs';

const royale = competent(TUNED);
const noroute = competent({ ...TUNED, wChest: 0 });
const rnd = randomBot();

function run(cfg, a, b, seed) {
  const rng = mulberry32(seed);
  let s = initial(cfg);
  let plies = 0, avail = 0, promos = 0;
  const bots = [a, b];
  for (let n = 0; !s.over && n < 800; n++) {
    plies++;
    if (moves(s).some((m) => s.board[m.to])) avail++;
    const mv = bots[s.turn](s, rng);
    if (mv && s.chests[mv.to] && s.board[mv.from].t === 'r') promos++;
    s = apply(s, mv);
  }
  return { s, avail: avail / plies, promos };
}

const rate = (cfg, a, b, g) => {
  let w = 0;
  for (let i = 0; i < g; i++) {
    const sw = i % 2 === 1;
    if (run(cfg, sw ? b : a, sw ? a : b, 3300 + i).s.over?.winner === (sw ? 1 : 0)) w++;
  }
  return (100 * w) / g;
};

const g = Number(process.argv[2] ?? 24);
console.log(`\nsize 9, runner step 2, queen-free paired-rook layout, ${g} games\n`);
for (const actions of [1, 2, 3, 4]) {
  const cfg = config({ size: 9, runnerStep: 2, layout: L.paired_rooks, actions });
  let av = 0, cap = 0, ring = 0, draws = 0, pr = 0;
  for (let i = 0; i < g; i++) {
    const r = run(cfg, royale, royale, 8800 + i);
    av += r.avail; cap += r.s.killed.capture; ring += r.s.killed.collapse; pr += r.promos;
    if (r.s.over?.winner === null || r.s.over?.winner === undefined) draws++;
  }
  const f = (n) => (n / g).toFixed(1).padStart(4);
  console.log(
    `${actions} move${actions > 1 ? 's' : ' '}/turn   promotions ${f(pr)}/10   capture available ${((100 * av) / g).toFixed(0).padStart(3)}%` +
    `   taken ${f(cap)}   ring-kills ${f(ring)}   draws ${((100 * draws) / g).toFixed(0).padStart(3)}%` +
    `   vs-noroute ${rate(cfg, royale, noroute, g).toFixed(0).padStart(3)}%   vs-random ${rate(cfg, royale, rnd, g).toFixed(0).padStart(3)}%`
  );
}
console.log('');
