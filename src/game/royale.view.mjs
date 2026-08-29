import {
  config, initial, moves, apply, material, roundsToCollapse, ringOf, lifespan,
  idx, ux, uy, VALUE,
} from './royale.rules.mjs';
import { competent, mulberry32, TUNED } from './royale.ai.mjs';

const GLYPH = { r: '♟', N: '♞', B: '♝', R: '♜', Q: '♛' };
const NAME = { r: 'runner', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen' };
const YOU = 0, FOE = 1;

const el = (id) => document.getElementById(id);
const boardEl = el('board');
const bot = competent(TUNED);

let cfg, state, turnStart, history, sel, lastMove, thinking, rng;

function reset() {
  cfg = config();
  state = initial(cfg);
  turnStart = state;
  history = [];
  sel = null;
  lastMove = null;
  thinking = false;
  rng = mulberry32((Math.random() * 1e9) | 0);
  el('over').hidden = true;
  draw();
}

// ---- rendering -------------------------------------------------------------

const cells = [];
for (let i = 0; i < 81; i++) {
  const b = document.createElement('button');
  b.className = 'cell';
  b.type = 'button';
  cells.push(b);
}

function draw() {
  const s = state;
  const legal = sel === null ? [] : moves(s, YOU).filter((m) => m.from === sel);
  const dests = new Map(legal.map((m) => [m.to, !!s.board[m.to]]));
  const ringSoon = roundsToCollapse(s) <= 1;

  boardEl.replaceChildren();
  // Seat 0 sits at the bottom, so rows are drawn from the far rank down.
  for (let y = cfg.size - 1; y >= 0; y--) {
    for (let x = 0; x < cfg.size; x++) {
      const i = idx(cfg, x, y);
      const c = cells[i];
      c.className = 'cell' + ((x + y) % 2 ? ' alt' : '');
      c.replaceChildren();
      c.disabled = false;
      c.setAttribute('aria-label', `${String.fromCharCode(97 + x)}${y + 1}`);

      const dead = x < s.lo || x > s.hi || y < s.lo || y > s.hi;
      if (dead) { c.classList.add('dead'); c.disabled = true; boardEl.append(c); continue; }

      if (ringSoon && ringOf(s, i) === 0) c.classList.add('doomed');
      if (lastMove && (i === lastMove.from || i === lastMove.to)) c.classList.add('last');
      if (i === sel) c.classList.add('sel');

      const chest = s.chests[i];
      if (chest) {
        const d = document.createElement('span');
        d.className = 'chest' + (lifespan(s, ringOf(s, i)) <= 1 ? ' expiring' : '');
        d.textContent = GLYPH[chest];
        c.append(d);
      }

      const p = s.board[i];
      if (p) {
        const g = document.createElement('span');
        g.className = 'piece ' + (p.c === YOU ? 'you' : 'foe');
        g.textContent = GLYPH[p.t];
        c.append(g);
      }

      if (dests.has(i)) {
        const d = document.createElement('span');
        d.className = 'dot' + (dests.get(i) ? ' take' : '');
        c.append(d);
      }
      boardEl.append(c);
    }
  }

  el('c-round').textContent = Math.min(s.round, cfg.lastRound);
  const rc = roundsToCollapse(s);
  const ring = el('c-ring');
  ring.classList.toggle('hot', rc <= 1);
  // Name the round it falls on, not a countdown — a countdown is one word away
  // from meaning either "after this round" or "after three more".
  ring.innerHTML = rc === Infinity ? 'Ring holds'
    : rc === 0 ? 'Ring falls <b>this round</b>'
    : `Ring falls <b>round ${s.round + rc}</b>`;

  const left = s.turn === YOU ? cfg.actions - s.acted : 0;
  el('c-pips').innerHTML =
    '●'.repeat(left) + `<span class="spent">${'●'.repeat(cfg.actions - left)}</span>`;

  for (const seat of [YOU, FOE]) {
    const won = s.board.filter((p) => p && p.c === seat && p.t !== 'r').map((p) => GLYPH[p.t]);
    const t = el(seat === YOU ? 't-you' : 't-foe');
    t.className = 'won ' + (seat === YOU ? 'you' : 'foe') + (won.length ? '' : ' none');
    if (won.length) t.innerHTML = won.map((g) => `<i>${g}</i>`).join('');
    else t.textContent = 'no chests yet';
  }

  el('undo').disabled = thinking || !history.length;
  const end = el('end');
  end.disabled = thinking || s.turn !== YOU || !!s.over;
  // Skipping a whole turn is almost never right, so it does not get the green.
  const spent = left < cfg.actions;
  end.className = 'btn ' + (spent ? 'primary' : 'ghost');
  end.textContent = spent ? 'End turn' : 'Skip turn';

  say();
}

function say() {
  const s = state;
  if (s.over) return;
  const t = el('say');
  if (thinking) { t.innerHTML = 'Opponent is moving.'; return; }
  const left = cfg.actions - s.acted;
  const mine = material(s, YOU), theirs = material(s, FOE);
  const score = `You <b>${mine}</b> · them <b>${theirs}</b>.`;
  if (roundsToCollapse(s) === 0)
    t.innerHTML = `${score} The outlined ring is deleted at the end of this round.`;
  else t.innerHTML = `${score} <b>${left}</b> move${left === 1 ? '' : 's'} left this turn.`;
}

// ---- play ------------------------------------------------------------------

function tap(i) {
  if (thinking || state.over || state.turn !== YOU) return;
  const mv = sel === null ? null
    : moves(state, YOU).find((m) => m.from === sel && m.to === i);
  if (mv) return commit(mv);
  const p = state.board[i];
  sel = p && p.c === YOU && moves(state, YOU).some((m) => m.from === i) ? i : null;
  draw();
}

function commit(mv) {
  history.push(state);
  const took = state.board[mv.to];
  const chest = state.chests[mv.to];
  state = apply(state, mv);
  lastMove = mv;
  sel = null;
  if (chest && took === null) flash(`Popped a chest — that runner is a ${NAME[chest]}.`);
  after();
}

function endTurn() {
  if (thinking || state.turn !== YOU) return;
  history.push(state);
  while (state.turn === YOU && !state.over) state = apply(state, null);
  sel = null;
  after();
}

function after() {
  draw();
  if (state.over) return finish();
  if (state.turn === FOE) runBot();
}

function runBot() {
  thinking = true;
  history = [];
  draw();
  const step = () => {
    if (state.over) { thinking = false; return finish(); }
    if (state.turn !== FOE) {
      thinking = false;
      turnStart = state;
      return draw();
    }
    const mv = bot(state, rng);
    state = apply(state, mv);
    lastMove = mv ?? lastMove;
    draw();
    setTimeout(step, 380);
  };
  setTimeout(step, 420);
}

let flashTimer;
function flash(msg) {
  clearTimeout(flashTimer);
  const t = el('say');
  t.innerHTML = `<b>${msg}</b>`;
  flashTimer = setTimeout(say, 1600);
}

function finish() {
  const o = state.over;
  const w = o.winner;
  el('over-h').textContent = w === YOU ? 'You win' : w === FOE ? 'You lose' : 'Draw';
  el('over-p').textContent = o.reason === 'wiped'
    ? (w === YOU ? 'You took everything they had.' : w === FOE ? 'They took everything you had.' : 'Both sides were wiped out.')
    : `Round 11 ended. Material ${material(state, YOU)} to ${material(state, FOE)}.`;
  el('over').hidden = false;
}

boardEl.addEventListener('click', (e) => {
  const c = e.target.closest('.cell');
  if (c) tap(cells.indexOf(c));
});
el('undo').addEventListener('click', () => {
  if (!history.length || thinking) return;
  state = history.pop();
  sel = null;
  draw();
});
el('end').addEventListener('click', endTurn);
el('again').addEventListener('click', reset);

reset();
