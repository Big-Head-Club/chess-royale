import { initial, apply, VALUE } from '../src/game/royale.rules.mjs';
import { LAYOUTS } from './variants.mjs';
import { competent, mulberry32, TUNED } from './bots.mjs';

const bot = competent(TUNED);

function play(layout, rules, seed) {
  const rng = mulberry32(seed);
  let s = initial(layout, rules);
  for (let n = 0; !s.over && n < 400; n++) s = apply(s, bot(s, rng));
  return s;
}

function run(label, layout, rules, games) {
  let cap = 0, col = 0, rounds = 0, draws = 0, alive = 0;
  for (let g = 0; g < games; g++) {
    const s = play(layout, rules, 5500 + g);
    cap += s.killed.capture; col += s.killed.collapse; rounds += s.round;
    if (s.over?.winner === null || s.over?.winner === undefined) draws++;
    alive += s.board.filter(Boolean).length;
  }
  const f = (n) => (n / games).toFixed(1).padStart(4);
  console.log(`${label.padEnd(34)} captures ${f(cap)}  ring-kills ${f(col)}  survivors ${f(alive)}/14  round ${f(rounds)}  draws ${((100*draws)/games).toFixed(0).padStart(3)}%`);
}

const g = Number(process.argv[2] ?? 30);
console.log(`\nself-play, ${g} games\n`);
for (const [ln, layout] of [['A_centre_queen', LAYOUTS.A_centre_queen], ['B_no_queen', LAYOUTS.B_no_queen]])
  for (const cf of [false, true])
    for (const of_ of [false, true])
      run(`${ln} cap${cf ? '+fwd' : '-diag'} ${of_ ? 'offset' : 'facing'}`, layout, { capForward: cf, offset: of_ }, g);
console.log('');
