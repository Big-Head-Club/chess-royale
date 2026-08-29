// Where rooms live. Postgres when DATABASE_URL is set, memory otherwise, so
// tests and local play need no database.
//
// A room is read-modify-written on every move, so the Postgres path takes a row
// lock for the whole read-validate-apply-write cycle. Without it two moves
// arriving together would both read the same state and one would be lost.

const TTL_MS = 3 * 60 * 60 * 1000;
const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no look-alikes

export const newCode = () =>
  Array.from({ length: 4 }, () => CODE[(Math.random() * CODE.length) | 0]).join('');
export const newToken = () => Math.random().toString(36).slice(2, 12);

// ---- memory ----------------------------------------------------------------

function memoryStore() {
  const rooms = new Map();
  const listeners = new Set();
  const announce = (code) => { for (const fn of listeners) fn(code); };
  const sweep = () => {
    const cut = Date.now() - TTL_MS;
    for (const [c, r] of rooms) if (r.touched < cut) rooms.delete(c);
  };
  return {
    kind: 'memory',
    async init() {},
    async create(room) {
      sweep();
      let code;
      do { code = newCode(); } while (rooms.has(code));
      rooms.set(code, { room, touched: Date.now() });
      return code;
    },
    async get(code) {
      return rooms.get(code)?.room ?? null;
    },
    // Runs fn against the room and saves whatever it hands back. Node is single
    // threaded, so nothing can interleave between this read and its write.
    async update(code, fn) {
      const held = rooms.get(code);
      if (!held) return { missing: true };
      const out = await fn(held.room);
      if (out?.room) { rooms.set(code, { room: out.room, touched: Date.now() }); announce(code); }
      return out ?? {};
    },
    async count() { sweep(); return rooms.size; },
    onChange(fn) { listeners.add(fn); },
    async close() {},
  };
}

// ---- postgres --------------------------------------------------------------

async function postgresStore(url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    max: 8, idleTimeoutMillis: 30000,
  });
  const listeners = new Set();
  let notifier = null;

  const store = {
    kind: 'postgres',

    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS rooms (
          code       text PRIMARY KEY,
          room       jsonb NOT NULL,
          touched_at timestamptz NOT NULL DEFAULT now()
        )`);
      await pool.query('CREATE INDEX IF NOT EXISTS rooms_touched ON rooms (touched_at)');
      await store.listen();
    },

    // One long-lived connection carries change notifications, so an instance
    // hears about a move applied by any other instance.
    async listen() {
      notifier = await pool.connect();
      notifier.on('notification', (msg) => { for (const fn of listeners) fn(msg.payload); });
      notifier.on('error', () => setTimeout(() => store.listen().catch(() => {}), 2000));
      await notifier.query('LISTEN room_changed');
    },

    onChange(fn) { listeners.add(fn); },

    async create(room) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = newCode();
        const done = await pool.query(
          'INSERT INTO rooms (code, room) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING code',
          [code, room],
        );
        if (done.rowCount) return code;
      }
      throw new Error('could not allocate a room code');
    },

    async get(code) {
      const r = await pool.query('SELECT room FROM rooms WHERE code = $1', [code]);
      return r.rowCount ? r.rows[0].room : null;
    },

    async update(code, fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const r = await client.query('SELECT room FROM rooms WHERE code = $1 FOR UPDATE', [code]);
        if (!r.rowCount) { await client.query('ROLLBACK'); return { missing: true }; }
        const out = await fn(r.rows[0].room);
        if (out?.room) {
          await client.query(
            'UPDATE rooms SET room = $2, touched_at = now() WHERE code = $1', [code, out.room],
          );
          await client.query('SELECT pg_notify($1, $2)', ['room_changed', code]);
        }
        await client.query('COMMIT');
        return out ?? {};
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    async count() {
      await pool.query("DELETE FROM rooms WHERE touched_at < now() - interval '3 hours'");
      const r = await pool.query('SELECT count(*)::int AS n FROM rooms');
      return r.rows[0].n;
    },

    async close() { notifier?.release?.(); await pool.end(); },
  };
  return store;
}

export async function openStore(url = process.env.DATABASE_URL) {
  const store = url ? await postgresStore(url) : memoryStore();
  await store.init();
  return store;
}
