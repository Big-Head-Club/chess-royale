// Generates and verifies every daily ahead of time, in parallel. A puzzle only
// lands in the file if its par was proved optimal at generation time.
import { writeFileSync } from 'node:fs';
import { fork } from 'node:child_process';
import { cpus } from 'node:os';
import { puzzleFor, pack, unpack } from '../src/game/daily.mjs';

const same = (a, b) => a.length === b.length && a.every((v, i) => {
  const w = b[i];
  if (v === w) return true;
  return v && w && v.t === w.t && v.c === w.c;
});

export function bakeDay(d) {
  const p = puzzleFor(d);
  const row = pack(p);
  // The packed form has to rebuild the exact same board — otherwise the par we
  // proved belongs to a different puzzle than the one we ship.
  const back = unpack(row);
  if (!same(back.board, p.state.board) || !same(back.chests, p.state.chests))
    throw new Error(`day ${d}: packed puzzle does not rebuild`);
  return row;
}

if (process.env.BAKE_RANGE) {
  const [from, to] = process.env.BAKE_RANGE.split('-').map(Number);
  const rows = [];
  for (let d = from; d <= to; d++) rows.push(bakeDay(d));
  process.send(rows);
  process.exit(0);
}

const days = Number(process.argv[2] ?? 200);
const workers = Math.min(cpus().length, 8);
const size = Math.ceil(days / workers);
const t0 = Date.now();

const jobs = [];
for (let w = 0; w < workers; w++) {
  const from = w * size + 1, to = Math.min(days, (w + 1) * size);
  if (from > to) continue;
  jobs.push(new Promise((res, rej) => {
    const c = fork(new URL(import.meta.url).pathname, [], {
      env: { ...process.env, BAKE_RANGE: `${from}-${to}` }, silent: false,
    });
    c.on('message', res);
    c.on('exit', (code) => { if (code) rej(new Error(`worker ${from}-${to} exited ${code}`)); });
  }));
}

const out = (await Promise.all(jobs)).flat().sort((a, b) => a.d - b.d);
writeFileSync(new URL('../public/dailies.json', import.meta.url), JSON.stringify(out));
const pars = out.map((r) => r.par);
console.log(`baked ${out.length} days on ${workers} cores in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`par range ${Math.min(...pars)}-${Math.max(...pars)}, mean ${(pars.reduce((a, b) => a + b, 0) / pars.length).toFixed(1)}`);
