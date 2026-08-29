import { VALUE, moves, apply, ux, uy, forward, ringOf, lifespan } from './royale.rules.mjs';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function evaluate(s, me, o = {}) {
  const wChest = o.wChest ?? 2, wSafe = o.wSafe ?? 0.15;
  const wAggro = o.wAggro ?? 0, wCentre = o.wCentre ?? 0;
  const only = o.only ?? null;        // chase only this chest type
  const flat = o.flat ?? false;       // treat every chest as equally valuable
  const c = s.cfg;
  const mid = (c.size - 1) / 2;
  const enemy = [];
  for (let i = 0; i < s.board.length; i++) {
    const p = s.board[i];
    if (p && p.c !== me) enemy.push(i);
  }
  const chestList = [];
  for (let i = 0; i < s.chests.length; i++) if (s.chests[i]) chestList.push(i);

  let score = 0;
  for (let i = 0; i < s.board.length; i++) {
    const p = s.board[i];
    if (!p) continue;
    const sign = p.c === me ? 1 : -1;
    score += sign * (p.k ? 400 : VALUE[p.t] * 10);

    const life = lifespan(s, ringOf(s, i));
    if (life !== Infinity && life <= 1) {
      // The heart is the one piece you cannot afford to leave on a dying ring.
      const base = p.k ? 400 : VALUE[p.t] * 10 * wSafe;
      score -= sign * base * (life === 0 ? 0.9 : 0.45);
    }

    if (wChest && p.t === 'r') {
      const x = ux(c, i), y = uy(c, i), f = forward(p.c);
      let best = 0;
      for (const ci of chestList) {
        if (only && s.chests[ci] !== only) continue;
        const need = (uy(c, ci) - y) * f;
        if (need < 0) continue;                                  // never goes back
        const steps = Math.ceil(Math.max(Math.abs(ux(c, ci) - x), need) / c.runnerStep);
        if (steps > lifespan(s, ringOf(s, ci))) continue;         // chest dies first
        const worth = flat ? 40 : (VALUE[s.chests[ci]] - VALUE.r) * 10;
        const v = worth * Math.pow(0.82, steps);
        if (v > best) best = v;
      }
      score += sign * best * 0.5 * wChest;
    }

    if (wCentre) {
      const d = Math.max(Math.abs(ux(c, i) - mid), Math.abs(uy(c, i) - mid));
      score -= sign * d * wCentre;
    }
    if (wAggro && enemy.length) {
      let near = Infinity;
      for (const ei of enemy) {
        const d = Math.max(Math.abs(ux(c, ei) - ux(c, i)), Math.abs(uy(c, ei) - uy(c, i)));
        if (d < near) near = d;
      }
      score -= sign * near * wAggro;
    }
  }
  return score;
}

// Depth 2: my move, then their best reply under the same eval.
export function competent(o = {}) {
  return function pick(s, rng) {
    const me = s.turn, mine = moves(s);
    if (!mine.length) return null;
    const term = (st) => st.over
      ? (st.over.winner === me ? 1e6 : st.over.winner === null ? 0 : -1e6)
      : evaluate(st, me, o);
    let bestScore = -Infinity, best = [];
    for (const mv of mine) {
      const after = apply(s, mv);
      let sc;
      if (after.over) sc = term(after);
      else {
        const theirs = moves(after);
        sc = theirs.length ? Math.min(...theirs.map((rm) => term(apply(after, rm)))) : term(after);
      }
      if (sc > bestScore + 1e-9) { bestScore = sc; best = [mv]; }
      else if (sc > bestScore - 1e-9) best.push(mv);
    }
    return best[(rng() * best.length) | 0];
  };
}

export const randomBot = () => (s, rng) => {
  const m = moves(s);
  return m.length ? m[(rng() * m.length) | 0] : null;
};

export const TUNED = { wSafe: 0.15, wChest: 2 };
export const BOTS = {
  random: randomBot(),
  royale: competent(TUNED),
  noroute: competent({ ...TUNED, wChest: 0 }),
  scared: competent({ ...TUNED, wSafe: 0.7 }),
};
