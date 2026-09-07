import { config, initial, moves, apply, material } from './royale.rules.mjs';
import { renderBoard, ringChip, pips, GLYPH } from './board.view.mjs';

const el = (id) => document.getElementById(id);
const boardEl = el('board');
const cfg = config();

let seat = 0, code = null, token = null, state = null, sel = null, last = null;
let pending = [];                 // my moves this turn, so Undo has something to undo
let stream = null;
let startedAt = 0, reported = false;   // one start / one result per game, this seat
const track = (n, p) => window.tally && tally(n, p);

const post = async (path, body) => {
  const r = await fetch(path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'that did not work');
  return j;
};

// The server owns the rules; this rebuilds a playable state around what it sends.
function adopt(wire) {
  state = { ...initial(cfg), ...wire, cfg };
  last = wire.last ?? last;
  sel = null;
  if (state.turn !== seat) pending = [];
  if (state.seats?.[1] && !startedAt) { startedAt = Date.now(); track('start', { mode: 'versus' }); }
  if (!state.over && reported) { reported = false; startedAt = Date.now(); track('start', { mode: 'versus' }); }  // rematch
  draw();
}

function connect() {
  stream?.close();
  stream = new EventSource(`/api/room/${code}/stream`);
  stream.onmessage = (e) => adopt(JSON.parse(e.data));
  stream.onerror = () => { el('say').textContent = 'Lost the connection. Reconnecting.'; };
}

async function make() {
  try {
    const j = await post('/api/room');
    ({ code, seat, token } = j);
    history.replaceState(null, '', `/versus?r=${code}`);
    track('room_created');
    enter();
  } catch (err) { el('lobby-say').textContent = err.message; }
}

async function join(c) {
  try {
    const j = await post(`/api/room/${c}/join`);
    code = c; seat = j.seat; token = j.token;
    history.replaceState(null, '', `/versus?r=${code}`);
    track('room_joined');
    enter();
  } catch (err) { el('lobby-say').textContent = err.message; }
}

function enter() {
  el('lobby').hidden = true;
  for (const id of ['chips', 'board', 'tray', 'acts']) el(id).hidden = false;
  connect();
}

function draw() {
  if (!state) return;
  renderBoard(boardEl, state, { seat, sel, last, legal: moves(state, seat) });
  el('c-round').textContent = Math.min(state.round, cfg.lastRound);
  ringChip(el('c-ring'), state);
  const mine = state.turn === seat;
  pips(el('c-pips'), mine ? cfg.actions - state.acted : 0, cfg.actions);

  for (const s of [seat, 1 - seat]) {
    const won = state.board.filter((p) => p && p.c === s && p.t !== 'r').map((p) => GLYPH[p.t]);
    const t = el(s === seat ? 't-you' : 't-foe');
    t.className = 'won ' + (s === seat ? 'you' : 'foe') + (won.length ? '' : ' none');
    if (won.length) t.innerHTML = won.map((g) => `<i>${g}</i>`).join('');
    else t.textContent = 'no chests yet';
  }

  el('undo').disabled = true;         // the server has already applied it
  el('end').disabled = !mine || !!state.over;
  el('end').className = 'btn ' + (mine && state.acted ? 'primary' : 'ghost');
  el('end').textContent = state.acted ? 'End turn' : 'Skip turn';

  if (state.over) return over();
  const [a, b] = state.material ?? [material(state, 0), material(state, 1)];
  const score = `You <b>${seat === 0 ? a : b}</b> · them <b>${seat === 0 ? b : a}</b>.`;
  if (!state.seats?.[1])
    el('say').innerHTML =
      `Room <b>${code}</b>. Send this page's link — the game starts when they open it.`;
  else if (mine) el('say').innerHTML = `${score} Your move, <b>${cfg.actions - state.acted}</b> left.`;
  else el('say').innerHTML = `${score} Waiting for them.`;
}

function over() {
  const o = state.over;
  const win = o.winner;
  if (!reported) {
    reported = true;
    track(win === null ? 'draw' : win === seat ? 'win' : 'lose',
      { mode: 'versus', seconds: Math.round((Date.now() - startedAt) / 1000), score: state.material?.[seat] });
  }
  el('over-h').textContent = win === null ? 'Draw' : win === seat ? 'You win' : 'You lose';
  el('over-p').textContent = o.reason === 'wiped'
    ? 'Everything on one side was taken.'
    : `Round ${cfg.lastRound} ended. Material ${state.material?.join(' to ')}.`;
  el('over').hidden = false;
}

async function send(from, to) {
  try { await post(`/api/room/${code}/move`, { token, from, to }); }
  catch (err) { el('say').textContent = err.message; }
}

boardEl.addEventListener('click', (e) => {
  const c = e.target.closest('.cell');
  if (!c || !state || state.over || state.turn !== seat) return;
  const i = Number(c.dataset.i);
  const mv = sel == null ? null : moves(state, seat).find((m) => m.from === sel && m.to === i);
  if (mv) { sel = null; return send(mv.from, mv.to); }
  const p = state.board[i];
  sel = p && p.c === seat && moves(state, seat).some((m) => m.from === i) ? i : null;
  draw();
});

el('make').addEventListener('click', make);
el('join').addEventListener('click', () => {
  const c = el('code').value.trim().toUpperCase();
  if (c.length === 4) join(c);
  else el('lobby-say').textContent = 'A room code is four characters.';
});
el('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') el('join').click(); });
el('end').addEventListener('click', () => {
  if (state && !state.over && state.turn === seat) send(-1, -1);
});
el('again').addEventListener('click', async () => {
  try { await post(`/api/room/${code}/rematch`, { token }); el('over').hidden = true; }
  catch (err) { el('over-p').textContent = err.message; }
});

const r = new URL(location.href).searchParams.get('r');
if (r) { el('code').value = r.toUpperCase(); join(r.toUpperCase()); }
