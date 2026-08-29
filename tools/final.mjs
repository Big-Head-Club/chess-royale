import { config, initial, apply, moves, VALUE } from '../src/game/royale.rules.mjs';
import { L } from './layouts.mjs';
import { competent, randomBot, mulberry32, TUNED } from './bots.mjs';

const royale = competent(TUNED);
const noroute = competent({ ...TUNED, wChest: 0 });
const rnd = randomBot();

function run(cfg, a, b, seed) {
  const rng = mulberry32(seed);
  let s = initial(cfg);
  let plies = 0, avail = 0;
  const popped = [[], []], bots = [a, b];
  for (let n = 0; !s.over && n < 800; n++) {
    plies++; if (moves(s).some((m) => s.board[m.to])) avail++;
    const mv = bots[s.turn](s, rng);
    if (mv && s.chests[mv.to] && s.board[mv.from].t === 'r') popped[s.turn].push(s.chests[mv.to]);
    s = apply(s, mv);
  }
  return { s, avail: avail / plies, popped };
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
console.log(`\nsize 9, runner step 2, 3 moves/turn, ${g} games\n`);
for (const [name, layout] of Object.entries(L)) {
  const cfg = config({ size: 9, runnerStep: 2, actions: 3, layout });
  const top = layout.reduce((m, c) => Math.max(m, VALUE[c[2]]), 0);
  let av = 0, cap = 0, ring = 0, draws = 0, pr = 0, dec = [0, 0];
  for (let i = 0; i < g; i++) {
    const r = run(cfg, royale, royale, 8800 + i);
    av += r.avail; cap += r.s.killed.capture; ring += r.s.killed.collapse;
    pr += r.popped[0].length + r.popped[1].length;
    const win = r.s.over?.winner;
    if (win === null || win === undefined) draws++;
    const has = [0, 1].map((c) => r.popped[c].some((t) => VALUE[t] === top));
    const only = has[0] !== has[1] ? (has[0] ? 0 : 1) : -1;
    if (only >= 0 && win !== null && win !== undefined) { dec[1]++; if (win === only) dec[0]++; }
  }
  const f = (n) => (n / g).toFixed(1).padStart(4);
  console.log(
    `${name.padEnd(13)} promos ${f(pr)}/10  capture-avail ${((100 * av) / g).toFixed(0).padStart(3)}%` +
    `  taken ${f(cap)}  ring ${f(ring)}  draws ${((100 * draws) / g).toFixed(0).padStart(3)}%` +
    `  sole-top wins ${dec[1] ? String(Math.round((100 * dec[0]) / dec[1])).padStart(3) + '%' : ' — '}(n=${String(dec[1]).padStart(2)})` +
    `  vs-noroute ${rate(cfg, royale, noroute, g).toFixed(0).padStart(3)}%  vs-random ${rate(cfg, royale, rnd, g).toFixed(0).padStart(3)}%`
  );
}
console.log('');
