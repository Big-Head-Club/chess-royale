import assert from 'node:assert/strict';
import { openStore } from '../src/server/store.mjs';
import { config, initial, moves, apply } from '../src/game/royale.rules.mjs';

const URL_ = process.env.TEST_DATABASE_URL || '';
const backends = [['memory', undefined], ...(URL_ ? [['postgres', URL_]] : [])];

const freshRoom = () => ({ state: initial(config()), seats: ['tok0', null], last: null });

for (const [name, url] of backends) {
  const store = await openStore(url);
  assert.equal(store.kind, name);

  // create / get
  const code = await store.create(freshRoom());
  assert.match(code, /^[A-Z0-9]{4}$/);
  const got = await store.get(code);
  assert.ok(got, 'room did not come back');
  assert.equal(got.state.board.filter(Boolean).length, 10);
  assert.equal(got.state.turn, 0);

  // the whole state survives a JSON round trip, cfg included
  assert.deepEqual(got.state.cfg.collapses, config().collapses);
  assert.equal(got.state.cfg.actions, config().actions);

  // missing rooms report themselves rather than throwing
  assert.equal((await store.update('ZZZZ', () => ({}))).missing, true);
  assert.equal(await store.get('ZZZZ'), null);

  // join writes back
  await store.update(code, (room) => { room.seats[1] = 'tok1'; return { room }; });
  assert.equal((await store.get(code)).seats[1], 'tok1');

  // a change event fires for whoever is listening
  let heard = null;
  store.onChange((c) => { heard = c; });
  await store.update(code, (room) => ({ room }));
  await new Promise((r) => setTimeout(r, name === 'postgres' ? 400 : 10));
  assert.equal(heard, code, 'no change event');

  // Two moves fired at once must both land. Without a lock around
  // read-validate-write they would read the same state and one would vanish.
  const play = () => store.update(code, (room) => {
    const legal = moves(room.state, room.state.turn);
    if (!legal.length) return {};
    room.state = apply(room.state, legal[0]);
    return { room };
  });
  const before = (await store.get(code)).state;
  await Promise.all([play(), play()]);
  const after = (await store.get(code)).state;
  const spent = (s) => (s.round - 1) * 2 * config().actions + (s.turn ? config().actions : 0) + s.acted;
  assert.equal(spent(after) - spent(before), 2, `${name}: a concurrent move was lost`);

  // Durability: a brand new store instance still sees the room. This is the
  // whole point — a redeploy must not drop a game in progress.
  await store.close();
  const reopened = await openStore(url);
  const survived = await reopened.get(code);
  if (name === 'postgres') {
    assert.ok(survived, 'room did not survive reopening the store');
    assert.equal(spent(survived.state), spent(after), 'state changed across a restart');
  } else {
    assert.equal(survived, null, 'memory store should not survive a restart');
  }
  await reopened.close();
  console.log(`store ok — ${name}${name === 'postgres' ? ' (survives a restart)' : ' (does not, as expected)'}`);
}
