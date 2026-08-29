import { initial, apply, VALUE } from '../src/game/royale.rules.mjs';
import { competent, mulberry32, TUNED } from './bots.mjs';

// Each layout is 180-degree rotationally symmetric so both seats face the same
// problem. Ring index decides the deadline: r2 dies round 12, r3 round 14.
export const LAYOUTS = {
  // A: queen alone on the untouchable centre square.
  A_centre_queen: [
    [6, 6, 'Q'], [3, 9, 'R'], [9, 3, 'R'], [2, 6, 'N'], [10, 6, 'N'], [4, 4, 'B'], [8, 8, 'B'],
  ],
  // B: no queen at all.
  B_no_queen: [
    [3, 9, 'R'], [9, 3, 'R'], [2, 6, 'N'], [10, 6, 'N'], [4, 4, 'B'], [8, 8, 'B'],
  ],
  // C: two queens on opposite wings, both on ring 2 — they die at round 12, so
  // each is a wing you have to commit to and cannot un-commit from.
  C_wing_queens: [
    [2, 6, 'Q'], [10, 6, 'Q'], [3, 9, 'R'], [9, 3, 'R'], [6, 6, 'N'], [4, 4, 'B'], [8, 8, 'B'],
  ],
  // D: no queen, rooks on the wings with a deadline, centre is a bishop.
  D_wing_rooks: [
    [2, 6, 'R'], [10, 6, 'R'], [3, 9, 'N'], [9, 3, 'N'], [6, 6, 'B'], [4, 4, 'B'], [8, 8, 'B'],
  ],
};

const bot = competent(TUNED);

function play(layout, seed) {
  const rng = mulberry32(seed);
  let s = initial(layout);
  const popped = [[], []];
  for (let n = 0; !s.over && n < 400; n++) {
    const mv = bot(s, rng);
    if (mv) {
      const chest = s.chests[mv.to];
      if (chest && s.board[mv.from].t === 'r') popped[s.turn].push(chest);
    }
    s = apply(s, mv);
  }
  return { s, popped };
}

function run(name, layout, games) {
  let cap = 0, col = 0, rounds = 0, decisive = 0, decisiveN = 0, draws = 0, promos = 0;
  const best = layout.reduce((m, c) => Math.max(m, VALUE[c[2]]), 0);
  for (let g = 0; g < games; g++) {
    const { s, popped } = play(layout, 9100 + g);
    cap += s.killed.capture; col += s.killed.collapse; rounds += s.round;
    promos += popped[0].length + popped[1].length;
    const w = s.over?.winner;
    if (w === null || w === undefined) draws++;
    // Did whoever grabbed the single most valuable chest type win?
    const holder = [0, 1].filter((c) => popped[c].some((t) => VALUE[t] === best));
    if (holder.length === 1 && w !== null && w !== undefined) {
      decisiveN++; if (w === holder[0]) decisive++;
    }
  }
  const f = (n) => (n / games).toFixed(1);
  console.log(
    `${name.padEnd(16)} captures ${f(cap).padStart(4)}  ring-kills ${f(col).padStart(4)}` +
    `  promos ${f(promos).padStart(4)}/${layout.length}  round ${f(rounds).padStart(4)}` +
    `  draws ${((100 * draws) / games).toFixed(0).padStart(3)}%` +
    `  top-chest wins ${decisiveN ? Math.round((100 * decisive) / decisiveN) + '%' : '—'} (n=${decisiveN})`
  );
}

const g = Number(process.argv[2] ?? 40);
console.log(`\nself-play, ${g} games per layout\n`);
for (const [k, v] of Object.entries(LAYOUTS)) run(k, v, g);
console.log('');
