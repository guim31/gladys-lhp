// -----------------------------------------------------------------------------
// The monitor against the recorded answers of the state portals (24/10/2026):
// what is discovered and published for each state, the internal timer, stale
// readings, the scene triggers, failures, restarts and the configuration paths.
// No gauge was on alert that day: the alerts are written into the recorded
// answers (api.set), in the format of each state.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_STATIONS } from '../src/config.js';
import { TRIGGERS, trendOf } from '../src/monitor.js';
import {
  BACHUM,
  BERTOLDSHEIM,
  KEMPTEN,
  MARBURG,
  MUENCHEN,
  NEU_ULM_Q,
  RENGERS,
  SCHOENA,
  START,
  TRIER,
  create,
  createWorld,
  cycle,
  discovered,
  featureId,
} from './helpers/world.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const ALL = [MUENCHEN, KEMPTEN, NEU_ULM_Q, BERTOLDSHEIM, RENGERS, SCHOENA, BACHUM, MARBURG, TRIER];

const lastValue = (world, externalId) => world.fake.lastState(externalId);
const featureKeys = (device) => device.features.map((f) => f.external_id.split(':').pop());

async function followed(t, ids, config = {}) {
  const world = await createWorld({ config: { stations: ids.join(','), ...config } });
  t.after(() => world.app.stop());
  const devices = [];
  for (const id of ids) {
    devices.push(await create(world, id));
  }
  return { world, devices };
}

test('every state: the features its gauges offer, and their states', async (t) => {
  const { world, devices } = await followed(t, ALL);
  const byId = Object.fromEntries(ALL.map((id, index) => [id, devices[index]]));
  const full = ['height', 'flow', 'alert_level', 'trend', 'last_reading'];
  for (const id of [MUENCHEN, KEMPTEN, RENGERS, SCHOENA, MARBURG, TRIER]) {
    assert.deepEqual(featureKeys(byId[id]), full, id);
  }
  assert.deepEqual(featureKeys(byId[BACHUM]), ['height', 'alert_level', 'trend', 'last_reading']);
  assert.deepEqual(featureKeys(byId[NEU_ULM_Q]), ['flow', 'last_reading']);
  assert.deepEqual(featureKeys(byId[BERTOLDSHEIM]), ['height', 'trend', 'last_reading']);
  assert.equal(byId[BERTOLDSHEIM].features[0].unit, 'm');
  assert.equal(byId[MUENCHEN].name, 'München / Isar');
  assert.equal(byId[MUENCHEN].model, 'Hochwasserportal · Bayern');
  assert.equal(byId[MUENCHEN].should_poll, false);

  const value = (id, key) => lastValue(world, featureId(byId[id], key));
  assert.equal(value(MUENCHEN, 'height'), 90);
  assert.equal(value(MUENCHEN, 'flow'), 20.9);
  assert.equal(value(MUENCHEN, 'alert_level'), 0);
  assert.equal(value(RENGERS, 'height'), 33);
  assert.equal(value(SCHOENA, 'flow'), 90.6);
  assert.equal(value(BACHUM, 'height'), 88.9);
  assert.equal(value(MARBURG, 'flow'), 1.63);
  assert.equal(value(TRIER, 'height'), 221);
  assert.equal(value(NEU_ULM_Q, 'flow'), 44.8);
  assert.equal(value(BERTOLDSHEIM, 'height'), 392);
  assert.equal(value(MUENCHEN, 'last_reading'), '24/10 01:00');
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('the container refreshes by its own timer, without onPoll: one request per bulk state', async (t) => {
  const timers = t.mock.timers;
  timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const world = await createWorld({
    config: { stations: [MUENCHEN, KEMPTEN, BACHUM].join(',') },
    timers: true,
  });
  t.after(() => world.app.stop());
  const device = await create(world, MUENCHEN);
  world.api.requests.length = 0;
  world.clock.advance(15 * MINUTE);
  world.api.set(MUENCHEN, { t: world.clock.now(), W: 95 });
  timers.tick(15 * MINUTE);
  await world.monitor.running;
  const urls = world.api.requests.map((request) => request.url);
  assert.deepEqual(urls.sort(), [
    'https://www.hnd.bayern.de/pegel',
    'https://www.hochwasserportal.nrw/data/internet/stations/100/2763190000100/S/week.json',
  ]);
  assert.equal(lastValue(world, featureId(device, 'height')), 95);
});

test('only the changes are published, and a stable value again after 12 hours', async (t) => {
  // The SDK dates its memory of the published states with Date.now().
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const { world, devices } = await followed(t, [MUENCHEN]);
  const height = featureId(devices[0], 'height');
  const count = () =>
    world.fake.states.filter((s) => s.device_feature_external_id === height).length;
  const before = count();
  for (let i = 0; i < 47; i += 1) {
    t.mock.timers.tick(15 * MINUTE);
    await cycle(world, 15);
    world.api.set(MUENCHEN, { t: world.clock.now(), W: 90 });
  }
  assert.equal(count(), before, 'same value at a new time: nothing sent before 12 hours');
  t.mock.timers.tick(15 * MINUTE);
  await cycle(world, 15);
  assert.equal(count(), before + 1, 'heartbeat');
  world.api.set(MUENCHEN, { t: world.clock.now(), W: 91 });
  await cycle(world, 1);
  assert.equal(count(), before + 2, 'a change');
});

test('the trend compares the level with the one of about an hour before', () => {
  const t0 = START;
  const points = (values) => values.map(([minutes, v]) => ({ t: t0 - minutes * MINUTE, v }));
  assert.equal(
    trendOf(
      points([
        [0, 100],
        [60, 90],
      ]),
    ),
    'rising',
  );
  assert.equal(
    trendOf(
      points([
        [0, 100],
        [60, 110],
      ]),
    ),
    'falling',
  );
  assert.equal(
    trendOf(
      points([
        [0, 100],
        [60, 100.5],
      ]),
    ),
    'steady',
  );
  assert.equal(
    trendOf(
      points([
        [0, 100],
        [30, 90],
      ]),
    ),
    null,
    'too recent',
  );
  assert.equal(
    trendOf(
      points([
        [0, 100],
        [180, 90],
      ]),
    ),
    null,
    'too old',
  );
  assert.equal(
    trendOf(
      points([
        [0, 5.2],
        [60, 5.1],
      ]),
      'm',
    ),
    'rising',
  );
});

test('the trend feature, once an hour of readings is known', async (t) => {
  const { world, devices } = await followed(t, [MUENCHEN], { language: 'de' });
  const trend = featureId(devices[0], 'trend');
  assert.equal(lastValue(world, trend), undefined, 'one reading: no trend yet');
  for (const [minutes, level] of [
    [15, 92],
    [15, 95],
    [15, 99],
    [15, 104],
  ]) {
    world.clock.advance(minutes * MINUTE);
    world.api.set(MUENCHEN, { t: world.clock.now(), W: level });
    await world.monitor.runCycle();
  }
  assert.equal(lastValue(world, trend), 'Steigt');
});

test('alert levels: one trigger per change, raised or lowered, in every format', async (t) => {
  const { world } = await followed(t, [MUENCHEN, RENGERS, SCHOENA, MARBURG, TRIER, BACHUM]);
  const events = () => world.fake.sceneEvents.map((event) => [event.key, event.data]);
  world.clock.advance(15 * MINUTE);
  const now = world.clock.now();
  world.api.set(MUENCHEN, { t: now, W: 300, stage: 2 });
  world.api.set(RENGERS, { t: now, W: 250 });
  world.api.set(SCHOENA, { t: now, W: 600, stage: 1 });
  world.api.set(MARBURG, { t: now, W: 490 });
  world.api.set(TRIER, { t: now, W: 1010 });
  world.api.set(BACHUM, { t: now, W: 410 });
  await world.monitor.runCycle();
  const raised = events().filter(([key]) => key === TRIGGERS.ALERT_RAISED);
  const levels = Object.fromEntries(raised.map(([, data]) => [data.station_name, data.level]));
  assert.deepEqual(levels, {
    'München / Isar': '2',
    'Rengers / Untere Argen': '2',
    'Schöna / Elbe': '1',
    'Marburg / Lahn': '3',
    'Trier / Mosel': '2',
    'Bachum / Ruhr': '2',
  });
  const muenchen = raised.find(([, data]) => data.station_name === 'München / Isar')[1];
  assert.deepEqual(
    {
      station: muenchen.station,
      river: muenchen.river,
      state: muenchen.state,
      previous_level: muenchen.previous_level,
      level_name: muenchen.level_name,
      height: muenchen.height,
      unit: muenchen.unit,
    },
    {
      station: discovered(world, MUENCHEN).external_id,
      river: 'Isar',
      state: 'Bayern',
      previous_level: '0',
      level_name: 'niveau 2 (crue moyenne)',
      height: 300,
      unit: 'cm',
    },
  );
  const level = featureId(discovered(world, MUENCHEN), 'alert_level');
  assert.equal(lastValue(world, level), 2);

  const before = world.fake.sceneEvents.length;
  await cycle(world, 15);
  assert.equal(world.fake.sceneEvents.length, before, 'same level: nothing');

  world.api.set(MUENCHEN, { t: world.clock.now(), W: 120, stage: 0 });
  await cycle(world, 1);
  const lowered = events().filter(([key]) => key === TRIGGERS.ALERT_LOWERED);
  assert.equal(lowered.length, 1);
  assert.deepEqual([lowered[0][1].previous_level, lowered[0][1].level], ['2', '0']);
});

test('no trigger without a created device, for a stale reading, nor after a day-old memory', async (t) => {
  const world = await createWorld({ config: { stations: MUENCHEN } });
  t.after(() => world.app.stop());
  world.api.set(MUENCHEN, { t: world.clock.now(), W: 300, stage: 2 });
  await cycle(world, 1);
  assert.equal(world.fake.sceneEvents.length, 0, 'no device');
  await create(world, MUENCHEN);
  world.clock.advance(2 * 24 * HOUR);
  world.api.set(MUENCHEN, { t: world.clock.now(), W: 500, stage: 3 });
  await world.monitor.runCycle();
  assert.equal(
    world.fake.sceneEvents.filter((event) => event.key.startsWith('alert_')).length,
    0,
    'the remembered level is two days old',
  );
  world.api.set(MUENCHEN, { t: world.clock.now() - 7 * HOUR, W: 90, stage: 0 });
  await cycle(world, 1);
  assert.equal(
    world.fake.sceneEvents.filter((event) => event.key.startsWith('alert_')).length,
    0,
    'an old reading fires nothing',
  );
});

test('a gauge going silent and coming back: triggers, and "Last reading" says since when', async (t) => {
  const { world, devices } = await followed(t, [TRIER]);
  const last = featureId(devices[0], 'last_reading');
  const height = featureId(devices[0], 'height');
  const statesBefore = world.fake.states.filter((s) => s.device_feature_external_id === height);
  world.clock.advance(7 * HOUR);
  await world.monitor.runCycle();
  assert.deepEqual(
    world.fake.sceneEvents.map((event) => event.key),
    [TRIGGERS.READINGS_STOPPED],
  );
  assert.equal(world.fake.sceneEvents[0].data.last_reading, '24/10 01:00');
  assert.equal(lastValue(world, last), 'Pas de nouvelle mesure depuis le 24/10 01:00');
  assert.equal(
    world.fake.states.filter((s) => s.device_feature_external_id === height).length,
    statesBefore.length,
    'the old level is not sent again',
  );
  world.api.set(TRIER, { t: world.clock.now(), W: 230 });
  await cycle(world, 15);
  assert.deepEqual(
    world.fake.sceneEvents.map((event) => event.key),
    [TRIGGERS.READINGS_STOPPED, TRIGGERS.READINGS_RESUMED],
  );
  assert.equal(lastValue(world, height), 230);
});

test('ids, numbers and names (umlauts, case, "name river") resolve through the lists', async (t) => {
  const world = await createWorld({
    config: { stations: 'by_16005701, 11402001, Schoena Elbe, marburg, Rengers / Untere Argen' },
  });
  t.after(() => world.app.stop());
  assert.deepEqual(world.monitor.followed(), [MUENCHEN, KEMPTEN, SCHOENA, MARBURG, RENGERS]);
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.connectionStatus.message, undefined);
});

test('unknown stations are reported: unsupported state, unknown id or name', async (t) => {
  const world = await createWorld({ config: { stations: 'XX_1, BY_1, Nowhere' } });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.en, /Unknown station: XX_1, Nowhere, BY_1/);
});

test('a state portal down: the status names it, the other states go on', async (t) => {
  const { world, devices } = await followed(t, [MUENCHEN, TRIER]);
  world.api.down.RP = 503;
  world.api.set(MUENCHEN, { t: world.clock.now(), W: 99 });
  await cycle(world, 15);
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.match(
    world.fake.connectionStatus.message.de,
    /Das Portal von Rheinland-Pfalz antwortet nicht/,
  );
  assert.equal(lastValue(world, featureId(devices[0], 'height')), 99);
  world.api.down.BY = 'network';
  await cycle(world, 15);
  assert.equal(world.fake.connectionStatus.connected, false, 'every followed state is down');
  world.api.down = {};
  await cycle(world, 15);
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.connectionStatus.message, undefined);
});

test('"around my house" adds the nearest gauges that send readings', async (t) => {
  const world = await createWorld({ config: { around_home: '20' } });
  t.after(() => world.app.stop());
  assert.deepEqual(world.monitor.followed(), [MUENCHEN]);
});

test('"around my house" without a located house is reported', async (t) => {
  const world = await createWorld({ config: { around_home: '20' }, houses: [] });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.en, /give your house a location/);
});

test('an empty configuration says what to do', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.fr, /Aucune station/);
  assert.deepEqual(world.fake.discoveredDevices, []);
});

test(`the configuration follows ${MAX_STATIONS} stations at most`, async (t) => {
  const ids = Array.from({ length: MAX_STATIONS + 2 }, (_, index) => `BY_${1000 + index}`);
  const world = await createWorld({ config: { stations: ids.join(',') } });
  t.after(() => world.app.stop());
  assert.equal(world.monitor.configured.length, MAX_STATIONS);
  assert.match(world.fake.connectionStatus.message.en, new RegExp(`first ${MAX_STATIONS}`));
});

test('a created device stays followed once removed from the configuration', async (t) => {
  const { world } = await followed(t, [MUENCHEN]);
  await world.fake.configUpdated({ stations: '' });
  assert.deepEqual(world.monitor.followed(), [MUENCHEN]);
  assert.ok(discovered(world, MUENCHEN));
});

test('a created device gets all its states at once, and the widget is refreshed', async (t) => {
  const world = await createWorld({ config: { stations: MARBURG } });
  t.after(() => world.app.stop());
  const refreshes = world.fake.widgetRefreshes.length;
  world.clock.advance(MINUTE);
  const device = await create(world, MARBURG);
  assert.equal(lastValue(world, featureId(device, 'height')), 146);
  assert.equal(lastValue(world, featureId(device, 'alert_level')), 0);
  assert.ok(world.fake.widgetRefreshes.length > refreshes);
});

test('a reconnection publishes the devices and every state again', async (t) => {
  const { world, devices } = await followed(t, [MUENCHEN]);
  const before = world.fake.states.length;
  await world.gladys.disconnect();
  await world.gladys.connect();
  assert.equal(world.fake.states.length, before * 2);
  assert.equal(world.fake.discoveredDevices[0].external_id, devices[0].external_id);
});

test('onPoll, should a Gladys call it: reads again only when the cycle is old', async (t) => {
  const { world, devices } = await followed(t, [MUENCHEN]);
  const requests = world.api.requests.length;
  await world.fake.poll(devices[0]);
  assert.equal(world.api.requests.length, requests);
  world.clock.advance(10 * MINUTE);
  await world.fake.poll(devices[0]);
  assert.equal(world.api.requests.length, requests + 1);
});

test('a device update republishes; a device created from an id alone gets its name', async (t) => {
  const world = await createWorld({ config: { stations: '' } });
  t.after(() => world.app.stop());
  await world.fake.configUpdated({ stations: TRIER });
  await world.monitor.running;
  const device = await create(world, TRIER);
  assert.equal(device.name, 'Trier / Mosel');
  const before = world.fake.states.length;
  world.gladys.forgetPublishedStates?.();
  await world.fake.deviceUpdated(device);
  assert.ok(world.fake.states.length > before, 'states published again after "Update"');
});

test('a configuration saved during a cycle is applied right after it', async (t) => {
  const world = await createWorld({ config: { stations: MUENCHEN } });
  t.after(() => world.app.stop());
  const running = world.monitor.runCycle();
  const saved = world.fake.configUpdated({ stations: `${MUENCHEN}, ${TRIER}` });
  await running;
  await saved;
  await world.monitor.rerun;
  assert.deepEqual(world.monitor.followed(), [MUENCHEN, TRIER]);
  assert.ok(discovered(world, TRIER));
});

test('a failed start keeps the internal timer', async (t) => {
  const timers = t.mock.timers;
  timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const state = { fail: true };
  const world = await createWorld({ config: { stations: MUENCHEN }, timers: true, connect: false });
  t.after(() => world.app.stop());
  const publish = world.gladys.publishDiscoveredDevices.bind(world.gladys);
  t.mock.method(world.gladys, 'publishDiscoveredDevices', async (devices) => {
    if (state.fail) {
      throw new Error('HTTP 503');
    }
    return publish(devices);
  });
  await world.gladys.connect();
  await world.app.ready;
  assert.ok(world.monitor.cycleTimer, 'scheduled despite the failure');
  state.fail = false;
  const requests = world.api.requests.length;
  world.clock.advance(15 * MINUTE);
  timers.tick(15 * MINUTE);
  await world.monitor.running;
  assert.equal(world.api.requests.length, requests + 1);
});

test('the levels remembered survive a restart; the stations no longer followed are forgotten', async (t) => {
  const { world } = await followed(t, [MUENCHEN, TRIER]);
  await world.app.stop();
  const saved = JSON.parse(await readFile(join(world.dataDir, 'lhp.json'), 'utf8'));
  assert.equal(saved.memory[MUENCHEN].stage.value, 0);
  assert.ok(saved.stations[TRIER].thresholds);

  const again = await createWorld({
    config: { stations: MUENCHEN },
    devices: [discovered(world, MUENCHEN)],
    dataDir: world.dataDir,
    clock: world.clock,
  });
  t.after(() => again.app.stop());
  again.api.set(MUENCHEN, { t: again.clock.now(), W: 300, stage: 1 });
  await cycle(again, 15);
  assert.deepEqual(
    again.fake.sceneEvents.map((event) => [event.key, event.data.previous_level]),
    [[TRIGGERS.ALERT_RAISED, '0']],
  );
  await again.monitor.store.flush();
  const after = JSON.parse(await readFile(join(world.dataDir, 'lhp.json'), 'utf8'));
  assert.deepEqual(Object.keys(after.stations), [MUENCHEN]);
});
