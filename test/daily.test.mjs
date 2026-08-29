import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unpack, bound, naiveCeiling, greedy, scoreOf, POINTS, RUNNERS } from '../src/game/daily.mjs';
import { moves, apply } from '../src/game/royale.rules.mjs';

let rows;
try { rows = JSON.parse(readFileSync(new URL('../public/dailies.json', import.meta.url), 'utf8')); }
catch { console.log('daily tests skipped — run `npm run bake` first'); process.exit(0); }

assert.ok(rows.length >= 30, `only ${rows.length} days baked`);

for (const row of rows) {
  const s = unpack(row);
  assert.equal(s.board.filter(Boolean).length, RUNNERS, `day ${row.d}: wrong runner count`);
  assert.equal(s.chests.filter(Boolean).length, 7, `day ${row.d}: wrong chest count`);

  // Par must be reachable in principle...
  assert.ok(row.par <= bound(s), `day ${row.d}: par ${row.par} exceeds its own upper bound`);
  // ...and must NOT be simply "take the four most valuable", or there is no
  // decision in the puzzle at all.
  assert.ok(row.par < naiveCeiling(s),
    `day ${row.d}: par ${row.par} equals the naive top-four total — the rings cost nothing`);
  // Four chests is the hard ceiling: a runner that takes one stops being one.
  assert.ok(row.par <= Object.values(POINTS).sort((a, b) => b - a).slice(0, RUNNERS).reduce((a, b) => a + b, 0));
  // Walking to the nearest chest must not be enough.
  assert.ok(greedy(s) <= row.par - 3, `day ${row.d}: nearest-chest scores ${greedy(s)} against par ${row.par}`);
}

// A day is playable to a finish and never scores above its own par by accident.
const s0 = unpack(rows[0]);
let s = s0, guard = 0;
while (!s.over && guard++ < 200) {
  const ms = moves(s);
  s = apply(s, ms.length ? ms[0] : null);
}
assert.ok(s.over, 'day 1 did not terminate');
assert.ok(scoreOf(s) <= rows[0].par, 'scored above par with arbitrary play');

console.log(`daily ok — ${rows.length} days, par ${Math.min(...rows.map(r => r.par))}-${Math.max(...rows.map(r => r.par))}`);
