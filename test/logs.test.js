// -----------------------------------------------------------------------------
// What the integration writes to `docker logs`: at info, only the lifecycle (a
// station going silent or coming back, an alert level change, the start), never one
// line per refresh cycle; a failure that repeats at every cycle is logged once,
// plus one line when it is over. Never the house coordinates: the configuration
// holds no secret, the location of the home is the sensitive data.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE, MUENCHEN, captureLogs, create, createWorld, cycle } from './helpers/world.js';

const strip = (line) => line.text.replace(/^\[[^\]]+\] /, '');

async function followed(t, config = {}) {
  const world = await createWorld({ config: { stations: MUENCHEN, around_home: '20', ...config } });
  t.after(() => world.app.stop());
  await create(world, MUENCHEN);
  return world;
}

test('the start is one info line', async (t) => {
  const lines = captureLogs(t, 'info');
  const world = await createWorld({ config: { stations: MUENCHEN } });
  t.after(() => world.app.stop());
  assert.deepEqual(lines.map(strip), [
    '[INFO] [lhp] Started: 1 station(s) followed, refreshed every 15 min',
  ]);
});

test('a normal refresh cycle writes nothing at info', async (t) => {
  const world = await followed(t);
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 6; i += 1) {
    await cycle(world, 15);
    world.api.set(MUENCHEN, { t: world.clock.now(), W: 90 + i });
  }
  assert.deepEqual(lines, []);
});

test('LOG_LEVEL=debug shows the cycles, never the house coordinates', async (t) => {
  const lines = captureLogs(t, 'debug');
  const world = await followed(t);
  await cycle(world, 15);
  await cycle(world, 15);
  assert.ok(lines.filter((line) => /Refresh cycle: 1 station/.test(line.text)).length >= 2);
  const all = lines.map((line) => line.text).join('\n');
  assert.doesNotMatch(all, new RegExp(String(HOUSE.latitude).replace('.', '\\.')));
  assert.doesNotMatch(all, new RegExp(String(HOUSE.longitude).replace('.', '\\.')));
});

test('a station going silent and coming back is one info line each', async (t) => {
  const world = await followed(t, { around_home: '0' });
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 26; i += 1) {
    await cycle(world, 15);
  }
  world.api.set(MUENCHEN, { t: world.clock.now(), W: 92 });
  await cycle(world, 15);
  assert.deepEqual(lines.map(strip), [
    '[INFO] [lhp] München / Isar: no new reading for 6 hours',
    '[INFO] [lhp] München / Isar: readings are back',
  ]);
});

test('an alert level change is one info line', async (t) => {
  const world = await followed(t, { around_home: '0' });
  const lines = captureLogs(t, 'info');
  world.api.set(MUENCHEN, { t: world.clock.now() + 15 * 60 * 1000, W: 300, stage: 1 });
  await cycle(world, 15);
  await cycle(world, 15);
  assert.deepEqual(lines.map(strip), ['[INFO] [lhp] München / Isar: alert level 0 -> 1']);
});

test('a portal down at every cycle: one warning, then one line at recovery', async (t) => {
  const world = await followed(t, { around_home: '0' });
  const lines = captureLogs(t, 'info');
  world.api.down = { BY: 503 };
  for (let i = 0; i < 4; i += 1) {
    await cycle(world, 15);
  }
  assert.deepEqual(
    lines.map((line) => [line.level, strip(line).replace(/^\[\w+\] /, '')]),
    [['warn', '[lhp] Bayern unreachable: www.hnd.bayern.de: HTTP 503']],
  );
  world.api.down = {};
  await cycle(world, 15);
  assert.deepEqual(lines.slice(1).map(strip), ['[INFO] [lhp] Bayern answers again']);
});

test('states refused at every cycle: one warning, then one line at recovery', async (t) => {
  const world = await followed(t, { around_home: '0' });
  const lines = captureLogs(t, 'info');
  const publish = t.mock.method(world.gladys, 'publishChangedStates', async () => {
    throw new Error('Gladys unreachable');
  });
  for (let i = 0; i < 3; i += 1) {
    await cycle(world, 15);
    world.api.set(MUENCHEN, { t: world.clock.now(), W: 70 + i });
  }
  await cycle(world, 1);
  assert.ok(publish.mock.callCount() >= 3);
  assert.deepEqual(
    lines.map((line) => [line.level, strip(line).replace(/^\[\w+\] /, '')]),
    [['warn', '[lhp] Publishing the states failed: Gladys unreachable']],
  );
  publish.mock.restore();
  await cycle(world, 15);
  assert.match(lines.at(-1).text, /\[INFO\].*Publishing the states works again/);
});

test('an unknown station is one warning, not one per cycle', async (t) => {
  const lines = captureLogs(t, 'info');
  const world = await createWorld({ config: { stations: 'Nowhere' } });
  t.after(() => world.app.stop());
  for (let i = 0; i < 6; i += 1) {
    await cycle(world, 30);
  }
  assert.equal(lines.filter((line) => /Unknown station: Nowhere/.test(line.text)).length, 1);
});
