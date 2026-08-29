// The board, drawn once and shared by all three modes.
import { moves, roundsToCollapse, ringOf, lifespan, idx, ux, uy } from './royale.rules.mjs';

export const GLYPH = { r: '♟', N: '♞', B: '♝', R: '♜', Q: '♛' };
export const NAME = { r: 'runner', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen' };

export function renderBoard(host, s, o = {}) {
  const cfg = s.cfg;
  const n = cfg.size;
  const seat = o.seat ?? 0;
  const legal = o.sel == null ? [] : (o.legal ?? moves(s, seat)).filter((m) => m.from === o.sel);
  const dests = new Map(legal.map((m) => [m.to, !!s.board[m.to]]));
  const ringSoon = roundsToCollapse(s) <= 1;

  host.style.setProperty('--n', n);
  host.replaceChildren();
  // Your own back rank sits at the bottom, whichever seat you are.
  const rows = seat === 0
    ? [...Array(n).keys()].reverse()
    : [...Array(n).keys()];
  const cols = seat === 0
    ? [...Array(n).keys()]
    : [...Array(n).keys()].reverse();

  for (const y of rows) {
    for (const x of cols) {
      const i = idx(cfg, x, y);
      const c = document.createElement('button');
      c.type = 'button';
      c.dataset.i = i;
      c.className = 'cell' + ((x + y) % 2 ? ' alt' : '');
      c.setAttribute('aria-label', `${String.fromCharCode(97 + x)}${y + 1}`);

      if (x < s.lo || x > s.hi || y < s.lo || y > s.hi) {
        c.classList.add('dead');
        c.disabled = true;
        host.append(c);
        continue;
      }
      if (ringSoon && ringOf(s, i) === 0) c.classList.add('doomed');
      if (o.last && (i === o.last.from || i === o.last.to)) c.classList.add('last');
      if (i === o.sel) c.classList.add('sel');

      const chest = s.chests[i];
      if (chest) {
        const d = document.createElement('span');
        d.className = 'chest' + (lifespan(s, ringOf(s, i)) <= 1 ? ' expiring' : '');
        d.textContent = GLYPH[chest];
        if (o.points) {
          const tag = document.createElement('b');
          tag.textContent = o.points[chest];
          d.append(tag);
        }
        c.append(d);
      }

      const p = s.board[i];
      if (p) {
        const g = document.createElement('span');
        g.className = 'piece ' + (p.c === seat ? 'you' : 'foe');
        g.textContent = GLYPH[p.t];
        c.append(g);
      }
      if (dests.has(i)) {
        const d = document.createElement('span');
        d.className = 'dot' + (dests.get(i) ? ' take' : '');
        c.append(d);
      }
      host.append(c);
    }
  }
}

export function ringChip(el, s) {
  const rc = roundsToCollapse(s);
  el.classList.toggle('hot', rc <= 1);
  el.innerHTML = rc === Infinity ? 'Ring holds'
    : rc === 0 ? 'Ring falls <b>this round</b>'
    : `Ring falls <b>round ${s.round + rc}</b>`;
}

export function pips(el, left, total) {
  el.innerHTML = '●'.repeat(Math.max(0, left)) +
    `<span class="spent">${'●'.repeat(Math.max(0, total - left))}</span>`;
}
