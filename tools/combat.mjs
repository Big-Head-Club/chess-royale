import { config, initial, apply, moves } from '../src/game/royale.rules.mjs';
import { L } from './layouts.mjs';
import { competent, mulberry32, TUNED } from './bots.mjs';

const bot = competent(TUNED);

function probe(cfg, games) {
  let plies = 0, pliesWithCapture = 0, taken = 0, ring = 0, draws = 0, rounds = 0;
  for (let g = 0; g < games; g++) {
    const rng = mulberry32(6600 + g);
    let s = initial(cfg);
    for (let n = 0; !s.over && n < 500; n++) {
      const legal = moves(s);
      plies++;
      if (legal.some((m) => s.board[m.to])) pliesWithCapture++;
      s = apply(s, bot(s, rng));
    }
    taken += s.killed.capture; ring += s.killed.collapse; rounds += s.round;
    if (s.over?.winner === null || s.over?.winner === undefined) draws++;
  }
  return {
    avail: (100 * pliesWithCapture) / plies,
    taken: taken / games, ring: ring / games,
    draws: (100 * draws) / games, rounds: rounds / games,
  };
}

const g = Number(process.argv[2] ?? 30);
console.log(`\n${g} games each — "capture available" is the share of turns on which taking something was even legal\n`);
for (const [ln, layout] of Object.entries(L))
  for (const spacing of [2, 1]) {
    const cfg = config({ size: 9, runnerStep: 2, layout, spacing });
    const r = probe(cfg, g);
    const per = cfg.size / spacing;
    console.log(
      `${ln.padEnd(14)} ${per} runners each   capture available ${r.avail.toFixed(0).padStart(3)}% of turns` +
      `   taken ${r.taken.toFixed(1).padStart(4)}   ring-kills ${r.ring.toFixed(1).padStart(4)}` +
      `   draws ${r.draws.toFixed(0).padStart(3)}%`
    );
  }
console.log('');
