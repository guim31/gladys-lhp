// -----------------------------------------------------------------------------
// The "Find stations" action, on the recorded station lists of the six states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE, captureLogs, createWorld } from './helpers/world.js';

async function search(t, fields, options = {}) {
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  const ack = await world.fake.action('search_stations', fields);
  assert.equal(ack.success, true);
  return { message: ack.data.message, world };
}

test('empty: the gauges around the house, nearest first, with their level', async (t) => {
  const { message } = await search(t, {});
  assert.equal(
    message.en,
    '1 station(s). Copy the ids into "Stations", then save:\nBY_16005701 — München / Isar, 1.8 km, 90 cm',
  );
  assert.match(message.de, /^1 Station\(en\)\. Kopiere die IDs/);
});

test('a larger radius reaches Baden-Württemberg', async (t) => {
  const { message } = await search(t, { radius: '100' });
  assert.doesNotMatch(message.en, /BW_00076/, 'Rengers is 123 km away');
  const wider = await search(t, { query: 'Argen', radius: '100' });
  assert.match(wider.message.fr, /BW_00076 — Rengers \/ Untere Argen, 122,7 km, 33 cm/);
});

test('a river, then a river and a name; umlauts and case ignored', async (t) => {
  const { message } = await search(t, { query: 'donau' });
  const lines = message.en.split('\n').slice(1);
  assert.deepEqual(
    lines.map((line) => line.split(' — ')[0]),
    ['BY_10041906', 'BY_10026302'],
  );
  assert.match(lines[1], /no recent reading/, 'a flow-only gauge has no level');
  const both = await search(t, { query: 'SCHOENA elbe' });
  assert.match(both.message.en, /SN_501010 — Schöna \/ Elbe, 359.9 km, 77 cm/);
});

test('a station id, a number and a state', async (t) => {
  const byId = await search(t, { query: 'he_25830056' });
  assert.match(byId.message.en, /HE_25830056 — Marburg \/ Lahn, .*146 cm/);
  const byNumber = await search(t, { query: '26500100' });
  assert.match(byNumber.message.en, /RP_26500100 — Trier \/ Mosel/);
  const byState = await search(t, { query: 'NW_' });
  assert.match(byState.message.en, /^2 station\(s\)/);
});

test('nothing found, no located house, portals unavailable', async (t) => {
  const none = await search(t, { query: 'Atlantis' });
  assert.equal(none.message.en, 'No station found.');
  const noHouse = await search(t, {}, { houses: [] });
  assert.match(noHouse.message.fr, /Votre maison n'a pas de position/);
  const world = await createWorld({ connect: false });
  t.after(() => world.app.stop());
  world.api.down = { '*': 503 };
  await world.gladys.connect();
  await world.app.ready;
  const ack = await world.fake.action('search_stations', { query: 'Isar' });
  assert.match(ack.data.message.en, /The flood portals do not answer/);
});

test('one info line per search, without the house coordinates', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const lines = captureLogs(t, 'info');
  await world.fake.action('search_stations', {});
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /Station search: 1 station\(s\) found/);
  assert.doesNotMatch(lines[0].text, new RegExp(String(HOUSE.latitude).replace('.', '\\.')));
});
