import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { config, initial, moves, apply, material } from './src/game/royale.rules.mjs';
import { startOfDay, dayNumber, POINTS } from './src/game/daily.mjs';
import { openStore, newToken } from './src/server/store.mjs';
import { createTally } from './src/server/tally/index.js';

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

const store = await openStore();
console.log(`rooms: ${store.kind}`);

// Analytics. Uses DATABASE_URL when present (Railway Postgres), else SQLite in TALLY_DIR.
const tally = createTally({ dir: process.env.TALLY_DIR || './data', tz: 'UTC' });

// ---- rooms -----------------------------------------------------------------

const sse = new Map();                       // code -> Set(response), this instance only

function publicState(room) {
  const s = room.state;
  return {
    board: s.board, chests: s.chests, lo: s.lo, hi: s.hi, turn: s.turn,
    round: s.round, acted: s.acted, over: s.over,
    seats: [!!room.seats[0], !!room.seats[1]],
    last: room.last, material: [material(s, 0), material(s, 1)],
  };
}

// One handler for every change, whoever made it. On Postgres this arrives over
// LISTEN/NOTIFY, so a move applied by another instance still reaches the
// browsers connected to this one.
store.onChange(async (code) => {
  const set = sse.get(code);
  if (!set?.size) return;
  const room = await store.get(code).catch(() => null);
  if (!room) return;
  const line = `data: ${JSON.stringify(publicState(room))}\n\n`;
  for (const res of set) { try { res.write(line); } catch { set.delete(res); } }
});

const freshRoom = () => ({ state: initial(config()), seats: [newToken(), null], last: null });

// ---- http ------------------------------------------------------------------

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 8192) throw new Error('too big');
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

createServer(async (req, res) => {
  if (await tally.handler(req, res)) return;
  const url = new URL(req.url, 'http://x');
  const path = decodeURIComponent(url.pathname);

  try {
    if (path === '/api/health') {
      return json(res, 200, { ok: true, rooms: await store.count(), store: store.kind, days: DAILIES.length });
    }

    if (path === '/api/daily') {
      if (!DAILIES.length) return json(res, 503, { error: 'The daily puzzles have not been baked yet.' });
      const day = Math.min(dayNumber(), DAILIES.length);
      const asked = Number(url.searchParams.get('d'));
      const pick = asked >= 1 && asked <= day ? asked : day;
      return json(res, 200, {
        day: pick, latest: day, total: DAILIES.length,
        puzzle: DAILIES[pick - 1], points: POINTS, nextAt: startOfDay(day + 1),
      });
    }

    if (path === '/api/room' && req.method === 'POST') {
      if (await store.count() > 2000) return json(res, 503, { error: 'too many rooms open right now' });
      const room = freshRoom();
      const code = await store.create(room);
      return json(res, 200, { code, seat: 0, token: room.seats[0] });
    }

    if (path.startsWith('/api/room/')) {
      const [, , , raw, action] = path.split('/');
      const code = (raw ?? '').toUpperCase();

      if (action === 'stream') {
        const room = await store.get(code);
        if (!room) return json(res, 404, { error: 'That room has expired or never existed.' });
        res.writeHead(200, {
          'content-type': 'text/event-stream', 'cache-control': 'no-cache',
          connection: 'keep-alive', 'x-accel-buffering': 'no',
        });
        res.write(`data: ${JSON.stringify(publicState(room))}\n\n`);
        if (!sse.has(code)) sse.set(code, new Set());
        sse.get(code).add(res);
        const beat = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* gone */ } }, 25000);
        req.on('close', () => {
          clearInterval(beat);
          const set = sse.get(code);
          set?.delete(res);
          if (set && !set.size) sse.delete(code);
        });
        return;
      }

      if (req.method !== 'POST') return json(res, 404, { error: 'no such action' });
      const sent = await body(req);

      // Everything that writes runs inside the store's lock, so the read, the
      // rules check and the write cannot be split by a second request.
      const out = await store.update(code, (room) => {
        const seat = room.seats.indexOf(sent.token);

        if (action === 'join') {
          if (room.seats[1]) return { status: 409, error: 'That room already has two players.' };
          const t = newToken();
          room.seats[1] = t;
          return { room, status: 200, body: { code, seat: 1, token: t } };
        }

        if (seat < 0) return { status: 403, error: 'not your seat' };

        if (action === 'move') {
          if (room.state.over) return { status: 409, error: 'the game is over' };
          if (room.state.turn !== seat) return { status: 409, error: 'not your turn' };
          const pass = sent.from === -1 && sent.to === -1;
          // The server owns the rules. A client can ask; it cannot assert.
          const legal = moves(room.state, seat).find((m) => m.from === sent.from && m.to === sent.to);
          if (!legal && !pass) return { status: 400, error: 'illegal move' };
          room.state = apply(room.state, legal ?? null);
          room.last = legal ?? room.last;
          return { room, status: 200, body: { ok: true } };
        }

        if (action === 'rematch') {
          if (!room.state.over) return { status: 409, error: 'finish this one first' };
          room.state = initial(config());
          room.last = null;
          return { room, status: 200, body: { ok: true } };
        }
        return { status: 404, error: 'no such action' };
      });

      if (out.missing) return json(res, 404, { error: 'That room has expired or never existed.' });
      return json(res, out.status ?? 500, out.error ? { error: out.error } : out.body ?? {});
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
    console.error(err);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('server error');
  }
}).listen(PORT, async () => {
  console.log(`chess royale  http://localhost:${PORT}`);
  await tally.ready;
  const origin = process.env.PUBLIC_ORIGIN
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${PORT}`);
  console.log('dashboard:', tally.dashboardUrl(origin));
});
