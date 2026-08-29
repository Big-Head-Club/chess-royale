import { competent, mulberry32 } from './bots.mjs';
import { playGame } from './duel.mjs';

const CFGS = [];
for (const wSafe of [0, 0.15, 0.35, 0.7])
  for (const wChest of [0, 0.5, 1, 2])
    CFGS.push({ name: `s${wSafe}/c${wChest}`, bot: competent({ wSafe, wChest }) });

const games = Number(process.argv[2] ?? 6);
const pts = CFGS.map(() => 0);
for (let i = 0; i < CFGS.length; i++)
  for (let j = i + 1; j < CFGS.length; j++)
    for (let g = 0; g < games; g++) {
      const swap = g % 2 === 1;
      const s = playGame(swap ? CFGS[j].bot : CFGS[i].bot, swap ? CFGS[i].bot : CFGS[j].bot, 7000 + g);
      const w = s.over?.winner;
      const iSeat = swap ? 1 : 0;
      if (w === null || w === undefined) { pts[i] += 0.5; pts[j] += 0.5; }
      else if (w === iSeat) pts[i] += 1; else pts[j] += 1;
    }

const n = (CFGS.length - 1) * games;
CFGS.map((c, i) => [c.name, pts[i] / n])
  .sort((a, b) => b[1] - a[1])
  .forEach(([nm, r]) => console.log(nm.padEnd(12), (100 * r).toFixed(1) + '%'));
