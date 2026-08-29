import { config, initial, apply, moves } from '../src/game/royale.rules.mjs';
import { competent, randomBot, mulberry32, TUNED } from './bots.mjs';

// Build a 180-degree symmetric layout on size 9 from half-board seeds.
const mirror = (seeds) => {
  const out = [], seen = new Set();
  for (const [x, y, t] of seeds)
    for (const [a, b] of [[x, y], [8 - x, 8 - y]]) {
      const k = a + ',' + b;
      if (!seen.has(k)) { seen.add(k); out.push([a, b, t]); }
    }
  return out;
};

const LAYOUTS = {
  'sparse  6': mirror([[1, 5, 'R'], [2, 6, 'N'], [3, 3, 'B']]),
  'medium  9': mirror([[1, 5, 'R'], [2, 6, 'N'], [3, 3, 'B'], [1, 3, 'N'], [4, 4, 'B']]),
  'dense  14': mirror([[1, 5, 'R'], [1, 3, 'R'], [2, 6, 'N'], [2, 2, 'N'],
                       [3, 3, 'B'], [3, 5, 'B'], [0, 4, 'N'], [4, 4, 'B']]),
  'flood  20': mirror([[1, 5, 'R'], [1, 3, 'R'], [2, 6, 'N'], [2, 2, 'N'], [3, 3, 'B'],
                       [3, 5, 'B'], [0, 4, 'N'], [4, 4, 'B'], [1, 1, 'B'], [2, 4, 'R'],
                       [5, 5, 'N'], [3, 7, 'B']]),
};

const royale = competent(TUNED);
const noroute = competent({ ...TUNED, wChest: 0 });
const rnd = randomBot();

function run(cfg, a, b, seed) {
  const rng = mulberry32(seed);
  let s = initial(cfg);
  let plies = 0, avail = 0, promos = 0;
  const bots = [a, b];
  for (let n = 0; !s.over && n < 500; n++) {
    const legal = moves(s);
    plies++; if (legal.some((m) => s.board[m.to])) avail++;
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

const g = Number(process.argv[2] ?? 30);
console.log(`\nsize 9, runner step 2, 10 runners on the board, ${g} games\n`);
for (const [name, layout] of Object.entries(LAYOUTS)) {
  const cfg = config({ size: 9, runnerStep: 2, layout });
  let av = 0, cap = 0, ring = 0, draws = 0, pr = 0;
  for (let i = 0; i < g; i++) {
    const r = run(cfg, royale, royale, 8800 + i);
    av += r.avail; cap += r.s.killed.capture; ring += r.s.killed.collapse; pr += r.promos;
    if (r.s.over?.winner === null || r.s.over?.winner === undefined) draws++;
  }
  const f = (n, d = 1) => (n / g).toFixed(d).padStart(4);
  console.log(
    `${name} chests   promotions ${f(pr)}/10   capture available ${((100 * av) / g).toFixed(0).padStart(3)}%` +
    `   taken ${f(cap)}   ring-kills ${f(ring)}   draws ${((100 * draws) / g).toFixed(0).padStart(3)}%` +
    `   vs-noroute ${rate(cfg, royale, noroute, g).toFixed(0).padStart(3)}%   vs-random ${rate(cfg, royale, rnd, g).toFixed(0).padStart(3)}%`
  );
}
console.log('');
