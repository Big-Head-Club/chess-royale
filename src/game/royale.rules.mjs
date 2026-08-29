// CHESS ROYALE — pure rules. No DOM, no clock, no Math.random.
//
// An odd square board with two seats facing each other. Face-up chests turn a
// runner into a real piece. The board collapses one ring at a time on a
// published schedule; anything standing on a dying ring is destroyed. No king,
// no check — you win by taking everything, or by holding more when time runs out.

export const VALUE = { r: 1, N: 3, B: 3, R: 5, Q: 9 };

// Chest layouts are 180-degree rotationally symmetric so both seats face an
// identical problem. A chest's ring index is its deadline.
const LAYOUT_BY_SIZE = {
  // No queen and nothing on the centre square: the centre is the one square the
  // collapse can never reach, so any unique top prize parked there simply wins
  // the game (measured at 87-100%). The two rooks are the best prize, they are
  // mirrored so both seats can reach one, and they sit on ring 1 — dead at the
  // end of round 7, so taking one is a commitment you cannot walk back.
  9:  [[1, 5, 'R'], [7, 3, 'R'], [2, 6, 'N'], [6, 2, 'N'], [3, 3, 'B'], [5, 5, 'B']],
  11: [[5, 5, 'Q'], [3, 7, 'R'], [7, 3, 'R'], [1, 5, 'N'], [9, 5, 'N'], [4, 4, 'B'], [6, 6, 'B']],
  13: [[6, 6, 'Q'], [3, 9, 'R'], [9, 3, 'R'], [2, 6, 'N'], [10, 6, 'N'], [4, 4, 'B'], [8, 8, 'B']],
};

// Collapses run at the END of these rounds, each removing the outer ring.
const SCHEDULE_BY_SIZE = { 9: [4, 7], 11: [4, 8, 11], 13: [5, 9, 12, 14] };

export const PRESET = {
  size: 9,
  runnerStep: 2,       // squares a runner may travel per move
  capForward: true,    // runners also capture straight ahead, not just diagonally
  spacing: 2,          // 2 = alternating squares on the back row, 1 = a full row
  hearts: false,       // one marked runner per seat; lose it and you lose
  actions: 3,          // moves a seat makes per turn — see README, this is the
                       // number that decides whether the game exists at all
  layout: null,        // defaults to LAYOUT_BY_SIZE[size]
  collapses: null,     // defaults to SCHEDULE_BY_SIZE[size]
  extraRounds: 4,      // rounds of play after the final collapse
};

export function config(over = {}) {
  const c = { ...PRESET, ...over };
  c.layout ??= LAYOUT_BY_SIZE[c.size];
  c.collapses ??= SCHEDULE_BY_SIZE[c.size];
  c.lastRound = c.collapses[c.collapses.length - 1] + c.extraRounds;
  return c;
}

export const idx = (c, x, y) => y * c.size + x;
export const ux = (c, i) => i % c.size;
export const uy = (c, i) => (i / c.size) | 0;
export const forward = (seat) => (seat === 0 ? 1 : -1);

export function initial(cfg = config()) {
  const n = cfg.size;
  const board = new Array(n * n).fill(null);
  const chests = new Array(n * n).fill(null);
  for (const [x, y, t] of cfg.layout) chests[idx(cfg, x, y)] = t;
  const mid = (n - 1) / 2;
  for (let x = 0; x < n; x += cfg.spacing) {
    board[idx(cfg, x, 0)] = { t: 'r', c: 0, k: cfg.hearts && x === mid };
    board[idx(cfg, x, n - 1)] = { t: 'r', c: 1, k: cfg.hearts && x === mid };
  }
  return { cfg, board, chests, lo: 0, hi: n - 1, turn: 0, round: 1, acted: 0,
           over: null, killed: { collapse: 0, capture: 0 } };
}

export function clone(s) {
  return { cfg: s.cfg, board: s.board.slice(), chests: s.chests.slice(),
           lo: s.lo, hi: s.hi, turn: s.turn, round: s.round, acted: s.acted, over: s.over,
           killed: { collapse: s.killed.collapse, capture: s.killed.capture } };
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const DIAG = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
const ORTH = [[1, 0], [0, 1], [-1, 0], [0, -1]];

const inside = (s, x, y) => x >= s.lo && x <= s.hi && y >= s.lo && y <= s.hi;

export function moves(s, colour = s.turn) {
  if (s.over) return [];
  const c = s.cfg, out = [];
  for (let i = 0; i < s.board.length; i++) {
    const p = s.board[i];
    if (!p || p.c !== colour) continue;
    const x = ux(c, i), y = uy(c, i);
    if (!inside(s, x, y)) continue;

    if (p.t === 'r') {
      const f = forward(colour);
      // Quiet steps: forward, forward-diagonal and sideways, up to runnerStep
      // squares, never through a piece. Sideways is what stops a runner being
      // trapped against a file; backward is never legal, and it never needs to
      // be — the collapse only ever pushes a runner forward.
      for (const [dx, dy] of [[0, f], [1, f], [-1, f], [1, 0], [-1, 0]]) {
        for (let k = 1; k <= c.runnerStep; k++) {
          const nx = x + dx * k, ny = y + dy * k;
          if (!inside(s, nx, ny) || s.board[idx(c, nx, ny)]) break;
          out.push({ from: i, to: idx(c, nx, ny) });
        }
      }
      for (const dx of (c.capForward ? [1, 0, -1] : [1, -1])) {
        const nx = x + dx, ny = y + f;
        if (!inside(s, nx, ny)) continue;
        const t = s.board[idx(c, nx, ny)];
        if (t && t.c !== colour) out.push({ from: i, to: idx(c, nx, ny) });
      }
      continue;
    }

    if (p.t === 'N') {
      for (const [dx, dy] of KNIGHT) {
        const nx = x + dx, ny = y + dy;
        if (!inside(s, nx, ny)) continue;
        const t = s.board[idx(c, nx, ny)];
        if (!t || t.c !== colour) out.push({ from: i, to: idx(c, nx, ny) });
      }
      continue;
    }

    for (const [dx, dy] of (p.t === 'B' ? DIAG : p.t === 'R' ? ORTH : DIAG.concat(ORTH))) {
      let nx = x + dx, ny = y + dy;
      while (inside(s, nx, ny)) {
        const t = s.board[idx(c, nx, ny)];
        if (t && t.c === colour) break;
        out.push({ from: i, to: idx(c, nx, ny) });
        if (t) break;
        nx += dx; ny += dy;
      }
    }
  }
  return out;
}

export const hasHeart = (s, colour) =>
  s.board.some((p) => p && p.c === colour && p.k);

export const material = (s, colour) =>
  s.board.reduce((m, p) => m + (p && p.c === colour ? VALUE[p.t] : 0), 0);
export const pieces = (s, colour) =>
  s.board.reduce((n, p) => n + (p && p.c === colour ? 1 : 0), 0);

function collapse(s) {
  const c = s.cfg, lo = s.lo, hi = s.hi;
  for (let i = 0; i < s.board.length; i++) {
    const x = ux(c, i), y = uy(c, i);
    if (x === lo || x === hi || y === lo || y === hi) {
      if (s.board[i]) s.killed.collapse++;
      s.board[i] = null;
      s.chests[i] = null;
    }
  }
  s.lo = lo + 1; s.hi = hi - 1;
}

function settle(s) {
  if (s.cfg.hearts) {
    const ha = hasHeart(s, 0), hb = hasHeart(s, 1);
    if (!ha || !hb) {
      s.over = { winner: ha === hb ? null : ha ? 0 : 1, reason: 'heart' };
      return;
    }
  }
  const a = pieces(s, 0), b = pieces(s, 1);
  if (!a && !b) return void (s.over = { winner: null, reason: 'wiped' });
  if (!b) return void (s.over = { winner: 0, reason: 'wiped' });
  if (!a) return void (s.over = { winner: 1, reason: 'wiped' });
  if (s.round > s.cfg.lastRound) {
    const ma = material(s, 0), mb = material(s, 1);
    s.over = { winner: ma === mb ? null : ma > mb ? 0 : 1, reason: 'material', ma, mb };
  }
}

function endTurn(s) {
  if (++s.acted < s.cfg.actions) { settle(s); return; }
  s.acted = 0;
  if (s.turn === 1) {
    if (s.cfg.collapses.includes(s.round)) collapse(s);
    s.round += 1;
  }
  s.turn = 1 - s.turn;
  settle(s);
}

export function apply(state, mv) {
  const s = clone(state);
  if (!mv || mv.from < 0) { endTurn(s); return s; }   // no legal move: pass
  const p = s.board[mv.from];
  if (s.board[mv.to]) s.killed.capture++;
  s.board[mv.from] = null;
  const chest = s.chests[mv.to];
  s.board[mv.to] = chest && p.t === 'r' ? { t: chest, c: p.c, k: p.k } : p;
  if (chest && p.t === 'r') s.chests[mv.to] = null;   // a chest pays out once
  endTurn(s);
  return s;
}

// Rounds left before the current outer ring is deleted. Always shown.
export function roundsToCollapse(s) {
  for (const r of s.cfg.collapses) if (r >= s.round) return r - s.round;
  return Infinity;
}

export const ringOf = (s, i) => {
  const x = ux(s.cfg, i), y = uy(s.cfg, i);
  return Math.min(x - s.lo, y - s.lo, s.hi - x, s.hi - y);
};

// How many more rounds a square on ring `rr` has before it is deleted.
export function lifespan(s, rr) {
  const up = s.cfg.collapses.filter((r) => r >= s.round);
  return rr >= up.length ? Infinity : up[rr] - s.round;
}
