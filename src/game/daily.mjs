// The daily puzzle. Pure — same rules module, one seat, no opponent.
//
// You have four runners and seven chests worth different points, sitting on
// rings that fall on a published schedule. You cannot have them all: a runner
// that pops a chest stops being a runner, so four chests is the ceiling and
// which four is the whole puzzle. Par is proved optimal before a puzzle ships.

import { config, initial, moves, apply, idx, ux, uy, forward } from './royale.rules.mjs';

export const POINTS = { B: 2, N: 3, R: 5, Q: 8 };
export const BAG = ['Q', 'R', 'R', 'N', 'N', 'B', 'B'];

// Two moves a round and runners that walk one square at a time. The versus game
// wants three moves and a two-square runner; the puzzle wants the clock to bite,
// and at versus speed nothing is ever out of reach in time — every day pars at
// the four most valuable chests and the choice disappears.
export const PUZZLE_CFG = {
  size: 9, solo: true, actions: 2, runnerStep: 1,
  collapses: [3, 5, 7], extraRounds: 1, spacing: 2,
};

export const RUNNERS = 4;

export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A 32-bit hash so the day number and a private salt make one seed.
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const ringOfSquare = (cfg, x, y) => Math.min(x, y, cfg.size - 1 - x, cfg.size - 1 - y);

// The round a square is deleted at the end of, or Infinity if it survives.
export function deadline(cfg, x, y) {
  const r = ringOfSquare(cfg, x, y);
  return r < cfg.collapses.length ? cfg.collapses[r] : Infinity;
}

// Moves a runner needs to walk from one square to another with nothing in the
// way. A move covers up to two squares, and a diagonal one covers two forward
// AND two sideways, so the cost is the larger axis.
export function walk(cfg, fx, fy, tx, ty) {
  const fwd = (ty - fy) * forward(0);
  if (fwd < 0) return Infinity;                    // runners never go back
  return Math.ceil(Math.max(fwd, Math.abs(tx - fx)) / cfg.runnerStep);
}

// Upper bound on points: best runner-to-chest assignment, ignoring that the
// three moves a round are shared. Ignoring that can only overshoot, which is
// exactly what makes it a bound.
export function bound(state) {
  const cfg = state.cfg;
  const runners = [], chests = [];
  for (let i = 0; i < state.board.length; i++) {
    const p = state.board[i];
    if (p && p.t === 'r') runners.push([ux(cfg, i), uy(cfg, i)]);
    if (state.chests[i]) chests.push([ux(cfg, i), uy(cfg, i), state.chests[i]]);
  }
  const cost = runners.map(([rx, ry]) => chests.map(([cx, cy, t]) => {
    const need = walk(cfg, rx, ry, cx, cy);
    const by = deadline(cfg, cx, cy);
    return need <= cfg.actions * (by === Infinity ? cfg.lastRound : by) ? POINTS[t] : -1;
  }));

  let best = 0;
  const taken = new Array(chests.length).fill(false);
  (function assign(r, got) {
    if (r === runners.length) { if (got > best) best = got; return; }
    assign(r + 1, got);                                    // this runner takes nothing
    for (let c = 0; c < chests.length; c++) {
      if (taken[c] || cost[r][c] < 0) continue;
      taken[c] = true; assign(r + 1, got + cost[r][c]); taken[c] = false;
    }
  })(0, 0);
  return best;
}

// What you would score if the rings never fell and you just took the four best
// chests. A puzzle in which this is achievable has no decision in it.
export function naiveCeiling(state) {
  return state.chests.filter(Boolean).map((t) => POINTS[t])
    .sort((a, b) => b - a).slice(0, RUNNERS).reduce((a, b) => a + b, 0);
}

export const scoreOf = (state) =>
  state.board.reduce((n, p) => n + (p && p.t !== 'r' ? POINTS[p.t] : 0), 0);

// Beam search over real play. Whatever this finds is genuinely achievable, so
// when it reaches the bound the two agree and par is proved optimal.
export function solve(state, width = 260) {
  const cfg = state.cfg;
  let beam = [state], best = scoreOf(state), bestLine = [];
  const lines = new Map([[state, []]]);

  while (beam.length) {
    const next = [];
    for (const s of beam) {
      for (const mv of moves(s)) {
        const a = apply(s, mv);
        const line = [...(lines.get(s) ?? []), mv];
        lines.set(a, line);
        const pts = scoreOf(a);
        if (pts > best) { best = pts; bestLine = line; }
        if (!a.over) next.push([a, pts]);
      }
    }
    if (!next.length) break;
    // Rank by points banked, then by how close the runners are to what is left.
    for (const n of next) n[2] = n[1] * 1000 - reach(n[0]);
    next.sort((p, q) => q[2] - p[2]);
    const seen = new Set();
    beam = [];
    for (const [s] of next) {
      const k = s.board.map((p) => (p ? p.t : '.')).join('') + '|' + s.chests.join('') + s.round + s.acted;
      if (seen.has(k)) continue;
      seen.add(k);
      beam.push(s);
      if (beam.length >= width) break;
    }
  }
  return { best, line: bestLine };
}

function reach(s) {
  const cfg = s.cfg;
  let total = 0;
  for (let i = 0; i < s.board.length; i++) {
    const p = s.board[i];
    if (!p || p.t !== 'r') continue;
    let near = 30;
    for (let j = 0; j < s.chests.length; j++) {
      if (!s.chests[j]) continue;
      const d = walk(cfg, ux(cfg, i), uy(cfg, i), ux(cfg, j), uy(cfg, j));
      if (d < near) near = d;
    }
    total += near;
  }
  return total;
}

// A player who always walks to the nearest chest. If this scores par the puzzle
// has no decision in it and does not ship.
export function greedy(state) {
  let s = state;
  while (!s.over) {
    const ms = moves(s);
    if (!ms.length) { s = apply(s, null); continue; }
    let pick = ms[0], bestScore = -Infinity;
    for (const mv of ms) {
      const a = apply(s, mv);
      const v = scoreOf(a) * 1000 - reach(a);
      if (v > bestScore) { bestScore = v; pick = mv; }
    }
    s = apply(s, pick);
  }
  return scoreOf(s);
}

function build(seed) {
  const rnd = rngFrom(seed);
  const cfg = config(PUZZLE_CFG);
  const n = cfg.size;
  const board = new Array(n * n).fill(null);
  const chests = new Array(n * n).fill(null);

  const files = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => rnd() - 0.5).slice(0, RUNNERS);
  for (const x of files) board[idx(cfg, x, (rnd() * 2) | 0)] = { t: 'r', c: 0 };

  const bag = [...BAG].sort(() => rnd() - 0.5);
  const spots = [];
  for (let y = 2; y < n; y++) for (let x = 0; x < n; x++) if (!board[idx(cfg, x, y)]) spots.push([x, y]);
  spots.sort(() => rnd() - 0.5);
  let placed = 0;
  for (const [x, y] of spots) {
    if (placed === bag.length) break;
    chests[idx(cfg, x, y)] = bag[placed++];
  }
  return { cfg, board, chests, lo: 0, hi: n - 1, turn: 0, round: 1, acted: 0,
           over: null, killed: { collapse: 0, capture: 0 } };
}

// Walks candidate seeds until one is provably fair and actually a puzzle.
export function puzzleFor(day, salt = 'chess-royale') {
  for (let attempt = 0; attempt < 6000; attempt++) {
    const seed = hash(`${salt}#${day}#${attempt}`);
    const state = build(seed);
    const ceiling = bound(state);
    if (ceiling < 11) continue;                            // has to be worth playing
    if (ceiling >= naiveCeiling(state)) continue;          // the rings must actually cost you something
    const { best, line } = solve(state);
    if (best !== ceiling) continue;                        // par must be proved optimal
    if (greedy(state) > best - 3) continue;                // nearest-chest must not solve it
    return { day, seed, attempt, state, par: best, line, naive: naiveCeiling(state) };
  }
  throw new Error(`no fair puzzle for day ${day}`);
}

// Compact wire form: where the runners are, where the chests are and what they
// are, and the proved par. The board is rebuilt from this, so a baked day is a
// few dozen bytes.
export function pack(p) {
  const cfg = p.state.cfg;
  const runners = [], chests = [];
  for (let i = 0; i < p.state.board.length; i++) {
    if (p.state.board[i]) runners.push(i);
    if (p.state.chests[i]) chests.push(i + p.state.chests[i]);
  }
  return { d: p.day, r: runners, c: chests, par: p.par };
}

export function unpack(row) {
  const cfg = config(PUZZLE_CFG);
  const n = cfg.size;
  const board = new Array(n * n).fill(null);
  const chests = new Array(n * n).fill(null);
  for (const i of row.r) board[i] = { t: 'r', c: 0 };
  for (const s of row.c) chests[parseInt(s, 10)] = s.slice(-1);
  return { cfg, board, chests, lo: 0, hi: n - 1, turn: 0, round: 1, acted: 0,
           over: null, killed: { collapse: 0, capture: 0 } };
}

export const EPOCH = Date.UTC(2026, 7, 28);         // 28 Aug 2026, day 1
export const DAY_MS = 86400000;
export const dayNumber = (now = Date.now()) => Math.floor((now - EPOCH) / DAY_MS) + 1;
export const startOfDay = (day) => EPOCH + (day - 1) * DAY_MS;
