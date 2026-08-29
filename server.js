import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { config, initial, moves, apply, material } from './src/game/royale.rules.mjs';
import { competent } from './src/game/royale.ai.mjs';
import { PUZZLE_CFG, unpack, dayNumber, startOfDay, DAY_MS, POINTS } from './src/game/daily.mjs';

const ROOT = new URL('.', import.meta.url).pathname;
const PORT = process.env.PORT ?? 4173;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.mjs': 'text/javascript',
                '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };

// Baked ahead of time by tools/bake-dailies.mjs. Nothing is generated at
// request time — a puzzle whose par has not been proved must never ship.
let DAILIES = [];
try {
  DAILIES = JSON.parse(readFileSync(new URL('./public/dailies.json', import.meta.url), 'utf8'));
} catch {
  console.warn('no public/dailies.json — run `npm run bake` before deploying');
}

// ---- multiplayer rooms -----------------------------------------------------
// In memory on purpose: a room is a conversation between two people that lasts
// twenty minutes. Nothing here is worth a database.

const rooms = new Map();
const ROOM_TTL = 3 * 60 * 60 * 1000;
const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no look-alikes

const newCode = () => {
  let c;
  do { c = Array.from({ length: 4 }, () => CODE[(Math.random() * CODE.length) | 0]).join(''); }
  while (rooms.has(c));
  return c;
};
const token = () => Math.random().toString(36).slice(2, 12);

function sweep() {
  const now = Date.now();
  for (const [code, r] of rooms) if (now - r.touched > ROOM_TTL) rooms.delete(code);
}
setInterval(sweep, 60000).unref?.();

function publicState(r) {
  const s = r.state;
  return {
    board: s.board, chests: s.chests, lo: s.lo, hi: s.hi, turn: s.turn,
    round: s.round, acted: s.acted, over: s.over,
    seats: [!!r.seats[0], !!r.seats[1]],
    last: r.last, material: [material(s, 0), material(s, 1)],
  };
}

function push(r) {
  const line = `data: ${JSON.stringify(publicState(r))}\n\n`;
  for (const res of r.clients) { try { res.write(line); } catch { /* dropped */ } }
}

// ---- http ------------------------------------------------------------------

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function body(req) {
  const chunks = [];
  for await (const c of req) {
    chunks.push(c);
    if (chunks.reduce((n, b) => n + b.length, 0) > 8192) throw new Error('too big');
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = decodeURIComponent(url.pathname);

  try {
    if (path === '/api/daily') {
      if (!DAILIES.length) return json(res, 503, { error: 'The daily puzzles have not been baked yet.' });
      const day = Math.min(dayNumber(), DAILIES.length);
      const asked = Number(url.searchParams.get('d'));
      const pick = asked >= 1 && asked <= day ? asked : day;
      return json(res, 200, {
        day: pick, latest: day, total: DAILIES.length,
        puzzle: DAILIES[pick - 1], points: POINTS,
        nextAt: startOfDay(day + 1),
      });
    }

    if (path === '/api/room' && req.method === 'POST') {
      sweep();
      if (rooms.size > 500) return json(res, 503, { error: 'too many rooms open right now' });
      const code = newCode();
      const t = token();
      rooms.set(code, {
        state: initial(config()), seats: [t, null], clients: new Set(),
        last: null, touched: Date.now(),
      });
      return json(res, 200, { code, seat: 0, token: t });
    }

    if (path.startsWith('/api/room/')) {
      const [, , , code, action] = path.split('/');
      const r = rooms.get((code ?? '').toUpperCase());
      if (!r) return json(res, 404, { error: 'That room has expired or never existed.' });
      r.touched = Date.now();

      if (action === 'join' && req.method === 'POST') {
        if (r.seats[1]) return json(res, 409, { error: 'That room already has two players.' });
        const t = token();
        r.seats[1] = t;
        push(r);
        return json(res, 200, { code, seat: 1, token: t });
      }

      if (action === 'stream') {
        res.writeHead(200, {
          'content-type': 'text/event-stream', 'cache-control': 'no-cache',
          connection: 'keep-alive', 'x-accel-buffering': 'no',
        });
        res.write(`data: ${JSON.stringify(publicState(r))}\n\n`);
        r.clients.add(res);
        const beat = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* gone */ } }, 25000);
        req.on('close', () => { clearInterval(beat); r.clients.delete(res); });
        return;
      }

      if (action === 'move' && req.method === 'POST') {
        const { token: t, from, to } = await body(req);
        const seat = r.seats.indexOf(t);
        if (seat < 0) return json(res, 403, { error: 'not your seat' });
        if (r.state.over) return json(res, 409, { error: 'the game is over' });
        if (r.state.turn !== seat) return json(res, 409, { error: 'not your turn' });
        // The server owns the rules. A client can ask; it cannot assert.
        const legal = moves(r.state, seat).find((m) => m.from === from && m.to === to);
        const pass = from === -1 && to === -1;
        if (!legal && !pass) return json(res, 400, { error: 'illegal move' });
        r.state = apply(r.state, legal ?? null);
        r.last = legal ?? r.last;
        push(r);
        return json(res, 200, { ok: true });
      }

      if (action === 'rematch' && req.method === 'POST') {
        const { token: t } = await body(req);
        if (r.seats.indexOf(t) < 0) return json(res, 403, { error: 'not your seat' });
        if (!r.state.over) return json(res, 409, { error: 'finish this one first' });
        r.state = initial(config());
        r.last = null;
        push(r);
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'no such action' });
    }

    // static
    let p = path === '/' ? '/public/index.html' : path;
    if (!p.startsWith('/public/') && !p.startsWith('/src/')) p = '/public' + p;
    if (!extname(p)) p += '.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      // Revalidate rather than cache: a stale module after a deploy is a worse
      // problem than the request it saves, and the whole game is a few kilobytes.
      'cache-control': 'no-cache',
    });
    res.end(data);
  } catch (err) {
    if (err?.code === 'ENOENT') { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('server error');
  }
}).listen(PORT, () => console.log(`chess royale  http://localhost:${PORT}`));
