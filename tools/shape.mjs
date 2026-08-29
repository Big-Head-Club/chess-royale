import { config, initial, apply, VALUE } from '../src/game/royale.rules.mjs';
import { competent, randomBot, mulberry32, TUNED } from './bots.mjs';

const royale = competent(TUNED);
const noroute = competent({ ...TUNED, wChest: 0 });
const rnd = randomBot();

function play(cfg, a, b, seed) {
  const rng = mulberry32(seed);
  let s = initial(cfg);
  const popped = [[], []];
  const bots = [a, b];
  for (let n = 0; !s.over && n < 500; n++) {
    const mv = bots[s.turn](s, rng);
    if (mv) {
      const ch = s.chests[mv.to];
      if (ch && s.board[mv.from].t === 'r') popped[s.turn].push(ch);
    }
    s = apply(s, mv);
  }
  return { s, popped };
}

function winRate(cfg, a, b, games) {
  let w = 0, d = 0;
  for (let g = 0; g < games; g++) {
    const swap = g % 2 === 1;
    const { s } = play(cfg, swap ? b : a, swap ? a : b, 3300 + g);
    const win = s.over?.winner, seatA = swap ? 1 : 0;
    if (win === null || win === undefined) d++; else if (win === seatA) w++;
  }
  return [(100 * w) / games, (100 * d) / games];
}

function row(label, cfg, games) {
  let cap = 0, col = 0, promo = 0, rounds = 0, draws = 0, qwin = [0, 0], units = 0;
  for (let g = 0; g < games; g++) {
    const { s, popped } = play(cfg, royale, royale, 8800 + g);
    cap += s.killed.capture; col += s.killed.collapse; rounds += s.round;
    promo += popped[0].length + popped[1].length;
    units = s.board.length;
    const win = s.over?.winner;
    if (win === null || win === undefined) draws++;
    const q = popped[0].includes('Q') ? 0 : popped[1].includes('Q') ? 1 : -1;
    if (q >= 0 && win !== null && win !== undefined) { qwin[1]++; if (win === q) qwin[0]++; }
  }
  const [vsNo] = winRate(cfg, royale, noroute, games);
  const [vsRnd] = winRate(cfg, royale, rnd, games);
  const f = (n) => (n / games).toFixed(1).padStart(4);
  console.log(
    `${label.padEnd(20)} cap ${f(cap)}  ring ${f(col)}  promo ${f(promo)}  rnd ${f(rounds)}` +
    `  draw ${((100 * draws) / games).toFixed(0).padStart(3)}%` +
    `  Qwins ${qwin[1] ? String(Math.round((100 * qwin[0]) / qwin[1])).padStart(3) + '%' : '  — '}` +
    `  vs-noroute ${vsNo.toFixed(0).padStart(3)}%  vs-random ${vsRnd.toFixed(0).padStart(3)}%`
  );
}

const g = Number(process.argv[2] ?? 24);
console.log(`\n${g} games per cell (self-play for the left block, matched pairs for the right)\n`);
for (const size of [9, 11, 13])
  for (const step of [1, 2])
    row(`size ${size}  step ${step}`, config({ size, runnerStep: step }), g);
console.log('');
