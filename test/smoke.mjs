import assert from 'node:assert/strict';
import { config, initial, moves, apply, material, uy } from '../src/game/royale.rules.mjs';
import { competent, mulberry32, TUNED } from '../tools/bots.mjs';

const cfg = config();
assert.equal(cfg.size, 9);
assert.equal(cfg.actions, 3);
assert.ok(!cfg.layout.some(([, , t]) => t === 'Q'), 'no queen');
assert.ok(!cfg.layout.some(([x, y]) => x === 4 && y === 4), 'centre square stays empty');

// The layout must be 180-degree symmetric or the two seats are not playing the
// same game.
const key = (x, y, t) => `${x},${y},${t}`;
const set = new Set(cfg.layout.map(([x, y, t]) => key(x, y, t)));
for (const [x, y, t] of cfg.layout)
  assert.ok(set.has(key(8 - x, 8 - y, t)), `chest ${x},${y} has no mirror`);

const s0 = initial(cfg);
assert.equal(material(s0, 0), material(s0, 1));
assert.ok(moves(s0).length > 0);

// A runner never has a backward move available. Sideways is legal, so the
// invariant is the rank it ends on, not the index.
for (const m of moves(s0))
  assert.ok(uy(cfg, m.to) >= uy(cfg, m.from), 'seat 0 runner moved backward');
const s1 = { ...initial(cfg), turn: 1 };
for (const m of moves(s1))
  assert.ok(uy(cfg, m.to) <= uy(cfg, m.from), 'seat 1 runner moved backward');

// Games always terminate.
const bot = competent(TUNED);
for (let seed = 0; seed < 12; seed++) {
  const rng = mulberry32(seed);
  let s = initial(cfg), n = 0;
  while (!s.over && n++ < 800) s = apply(s, bot(s, rng));
  assert.ok(s.over, `seed ${seed} did not terminate`);
}

// The rules module must not reach for the clock or the global RNG.
const src = await (await import('node:fs/promises')).readFile(
  new URL('../src/game/royale.rules.mjs', import.meta.url), 'utf8');
const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
assert.ok(!/Math\.random\s*\(|Date\.now\s*\(|\bdocument\b|\bwindow\b/.test(code),
  'rules are not pure');

console.log('smoke ok');
