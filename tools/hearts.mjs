import { config, initial, apply, moves } from '../src/game/royale.rules.mjs';
import { L } from './layouts.mjs';
import { competent, randomBot, mulberry32, TUNED } from './bots.mjs';

const royale = competent(TUNED);
const noroute = competent({ ...TUNED, wChest: 0 });
const rnd = randomBot();

function run(cfg, a, b, seed) {
  const rng = mulberry32(seed);
  let s = initial(cfg);
  let plies = 0, avail = 0;
  const bots = [a, b];
  for (let n = 0; !s.over && n < 500; n++) {
    const legal = moves(s);
    plies++; if (legal.some((m) => s.board[m.to])) avail++;
    s = apply(s, bots[s.turn](s, rng));
  }
  return { s, avail: avail / plies };
}

function rate(cfg, a, b, g) {
  let w = 0;
  for (let i = 0; i < g; i++) {
    const sw = i % 2 === 1;
    const { s } = run(cfg, sw ? b : a, sw ? a : b, 3300 + i);
    if (s.over?.winner === (sw ? 1 : 0)) w++;
  }
  return (100 * w) / g;
}

function row(name, cfg, g) {
  let av = 0, cap = 0, ring = 0, draws = 0, rounds = 0, byHeart = 0;
  for (let i = 0; i < g; i++) {
    const { s, avail } = run(cfg, royale, royale, 8800 + i);
    av += avail; cap += s.killed.capture; ring += s.killed.collapse; rounds += s.round;
    if (s.over?.reason === 'heart' && s.over.winner !== null) byHeart++;
    if (s.over?.winner === null || s.over?.winner === undefined) draws++;
  }
  const f = (n, d = 1) => (n / g).toFixed(d).padStart(4);
  console.log(
    `${name.padEnd(24)} capture available ${((100 * av) / g).toFixed(0).padStart(3)}%` +
    `   taken ${f(cap)}   ring-kills ${f(ring)}   round ${f(rounds)}` +
    `   draws ${((100 * draws) / g).toFixed(0).padStart(3)}%` +
    `   won by heart ${((100 * byHeart) / g).toFixed(0).padStart(3)}%` +
    `   vs-noroute ${rate(cfg, royale, noroute, g).toFixed(0).padStart(3)}%` +
    `   vs-random ${rate(cfg, royale, rnd, g).toFixed(0).padStart(3)}%`
  );
}

const g = Number(process.argv[2] ?? 30);
console.log(`\nsize 9, runner step 2, ${g} games\n`);
for (const [ln, layout] of Object.entries(L))
  for (const hearts of [false, true])
    row(`${ln} ${hearts ? 'HEARTS' : 'plain '}`, config({ size: 9, runnerStep: 2, layout, hearts }), g);
console.log('');
