import { initial, apply, moves, material } from '../src/game/royale.rules.mjs';
import { BOTS, mulberry32 } from './bots.mjs';

function play(botA, botB, seed) {
  const rng = mulberry32(seed);
  let s = initial();
  const bots = [botA, botB];
  const popped = [[], []];
  let captures = 0;
  for (let plies = 0; !s.over && plies < 400; plies++) {
    const mv = bots[s.turn](s, rng);
    if (!mv) { s = apply(s, { from: -1, to: -1 }); continue; }
    const seat = s.turn;
    if (s.board[mv.to]) captures++;
    const chest = s.chests[mv.to];
    if (chest && s.board[mv.from].t === 'r') popped[seat].push(chest);
    s = apply(s, mv);
  }
  return { s, popped, captures };
}

function match(nameA, nameB, games) {
  const w = [0, 0, 0];
  let rounds = 0, caps = 0, qWinLink = [0, 0];
  for (let g = 0; g < games; g++) {
    const swap = g % 2 === 1;
    const seatOfA = swap ? 1 : 0;
    const r = play(swap ? BOTS[nameB] : BOTS[nameA], swap ? BOTS[nameA] : BOTS[nameB], 4200 + g);
    const win = r.s.over?.winner;
    if (win === null || win === undefined) w[2]++;
    else if (win === seatOfA) w[0]++; else w[1]++;
    rounds += r.s.round; caps += r.captures;
    const qSeat = r.popped[0].includes('Q') ? 0 : r.popped[1].includes('Q') ? 1 : -1;
    if (qSeat >= 0) { qWinLink[1]++; if (win === qSeat) qWinLink[0]++; }
  }
  const pct = (n) => ((100 * n) / games).toFixed(0).padStart(3);
  console.log(
    `${(nameA + ' vs ' + nameB).padEnd(22)} A ${pct(w[0])}%  B ${pct(w[1])}%  draw ${pct(w[2])}%` +
    `   round ${(rounds / games).toFixed(1)}  captures ${(caps / games).toFixed(1)}` +
    `   won-with-queen ${qWinLink[1] ? Math.round(100 * qWinLink[0] / qWinLink[1]) + '%' : '—'} (n=${qWinLink[1]})`
  );
}

const g = Number(process.argv[2] ?? 60);
console.log(`\n${g} games each, seats swapped every other game\n`);
match('royale', 'random', g);
match('royale', 'material', g);
match('royale', 'noroute', g);
match('royale', 'scared', g);
match('noroute', 'material', g);
console.log('');
