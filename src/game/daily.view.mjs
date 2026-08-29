import { moves, apply, roundsToCollapse } from './royale.rules.mjs';
import { unpack, scoreOf, POINTS } from './daily.mjs';
import { renderBoard, ringChip, pips, GLYPH, NAME } from './board.view.mjs';

const el = (id) => document.getElementById(id);
const boardEl = el('board');

let meta, state, start, history, sel, last, flashTimer;

const KEY = (d) => `chess-royale-daily-${d}`;

async function boot() {
  const url = new URL(location.href);
  const d = url.searchParams.get('d');
  const res = await fetch('/api/daily' + (d ? `?d=${d}` : ''));
  meta = await res.json();
  el('c-day').textContent = meta.day;
  el('c-par').textContent = meta.par ?? meta.puzzle.par;
  state = start = unpack(meta.puzzle);
  history = [];
  sel = null;
  last = null;

  const done = load();
  draw();
  if (done) return finish(done, true);
  el('say').innerHTML = 'Walk a runner onto a chest to take it. A runner that '
    + 'takes one stops being a runner, so <b>four chests is the ceiling</b> — and '
    + 'a piece caught on a falling ring takes its points with it.';
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY(meta.day)) || 'null'); }
  catch { return null; }
}
function save(rec) {
  try { localStorage.setItem(KEY(meta.day), JSON.stringify(rec)); } catch { /* private mode */ }
}

function draw() {
  const par = meta.puzzle.par;
  renderBoard(boardEl, state, { seat: 0, sel, last, points: POINTS });
  el('c-score').textContent = scoreOf(state);
  ringChip(el('c-ring'), state);
  pips(el('c-pips'), state.cfg.actions - state.acted, state.cfg.actions);

  const got = state.board.filter((p) => p && p.t !== 'r').map((p) => GLYPH[p.t]);
  const t = el('t-got');
  t.className = 'won you' + (got.length ? '' : ' none');
  if (got.length) t.innerHTML = got.map((g) => `<i>${g}</i>`).join('');
  else t.textContent = 'nothing yet';

  el('undo').disabled = !history.length || !!state.over;
  el('end').disabled = !!state.over;
  el('end').className = 'btn ' + (state.acted ? 'primary' : 'ghost');
  el('end').textContent = state.acted ? 'End round' : 'Skip round';
}

function tap(i) {
  if (state.over) return;
  const mv = sel == null ? null : moves(state).find((m) => m.from === sel && m.to === i);
  if (mv) {
    history.push(state);
    const chest = state.chests[mv.to];
    state = apply(state, mv);
    last = mv; sel = null;
    if (chest) flash(`Took the ${NAME[chest]} — ${POINTS[chest]} points.`);
    draw();
    if (state.over) finish(record());
    return;
  }
  // Any of your pieces, not just runners. A promoted piece still has to walk
  // off a ring that is about to fall — it takes its points down with it.
  const p = state.board[i];
  sel = p && moves(state).some((m) => m.from === i) ? i : null;
  draw();
}

function flash(msg) {
  clearTimeout(flashTimer);
  el('say').innerHTML = `<b>${msg}</b>`;
  flashTimer = setTimeout(() => {
    if (!state.over) el('say').innerHTML = `Ring ${roundsToCollapse(state) === 0
      ? 'falls at the end of this round — the outlined squares go with it.'
      : 'schedule is on the chip above.'}`;
  }, 1800);
}

function record() {
  const got = state.board.filter((p) => p && p.t !== 'r').map((p) => p.t);
  const rec = { day: meta.day, score: scoreOf(state), par: meta.puzzle.par, got };
  save(rec);
  return rec;
}

function finish(rec, restored = false) {
  const perfect = rec.score >= rec.par;
  el('over-h').textContent = perfect ? 'Par' : `${rec.score} of ${rec.par}`;
  el('over-p').textContent = perfect
    ? 'Nobody could have done better on this board. That is the proved maximum.'
    : restored ? 'You have already played today.'
    : `Par ${rec.par} is provable — that much really was on the board.`;

  // Four lines, and the last one is the link.
  const strip = [...rec.got.map((t) => GLYPH[t]), ...Array(4 - rec.got.length).fill('·')].join('');
  el('share').textContent =
    `Chess Royale ${rec.day}\n${rec.score}/${rec.par}${perfect ? ' — par' : ''}\n${strip}\n${location.origin}/daily`;

  const next = new Date(meta.nextAt);
  el('next').textContent = `Next puzzle ${next.toLocaleString(undefined, { month: 'short', day: 'numeric' })}.`;
  el('over').hidden = false;
}

boardEl.addEventListener('click', (e) => {
  const c = e.target.closest('.cell');
  if (c) tap(Number(c.dataset.i));
});
el('undo').addEventListener('click', () => {
  if (!history.length || state.over) return;
  state = history.pop(); sel = null; draw();
});
el('end').addEventListener('click', () => {
  if (state.over) return;
  history.push(state);
  const round = state.round;
  while (state.round === round && !state.over) state = apply(state, null);
  sel = null; draw();
  if (state.over) finish(record());
});
el('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el('share').textContent);
    el('copy').textContent = 'Copied';
    setTimeout(() => { el('copy').textContent = 'Copy result'; }, 1500);
  } catch { el('copy').textContent = 'Select it and copy'; }
});

boot();
