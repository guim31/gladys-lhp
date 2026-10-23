// -----------------------------------------------------------------------------
// The `stations` dashboard widget: the content fits the core vocabulary and
// budget (validateWidgetContent, empty array = rendered as sent), every bound
// feature exists on a published device, and the colours follow the alert level.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_COLORS, validateWidgetContent } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from '../src/config.js';
import { WIDGET_KEY } from '../src/monitor.js';
import { stationValue } from '../src/widgets.js';
import {
  BACHUM,
  BERTOLDSHEIM,
  MUENCHEN,
  TRIER,
  create,
  createWorld,
  cycle,
} from './helpers/world.js';

async function worldWith(t, ids) {
  const world = await createWorld({ config: { stations: ids.join(',') } });
  t.after(() => world.app.stop());
  const devices = [];
  for (const id of ids) {
    devices.push(await create(world, id));
  }
  return { world, devices };
}

async function content(world, settings = {}, language = 'fr') {
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings, language, units: 'metric' });
  assert.equal(ack.success, true);
  return ack.data.content;
}

const features = (devices) =>
  new Set(devices.flatMap((device) => device.features.map((feature) => feature.external_id)));

test('the overview: one line per station, valid in every language', async (t) => {
  const { world } = await worldWith(t, [MUENCHEN, BACHUM, BERTOLDSHEIM, TRIER]);
  world.clock.advance(7 * 60 * 60 * 1000);
  for (const id of [MUENCHEN, BACHUM, BERTOLDSHEIM]) {
    world.api.set(id, { t: world.clock.now(), W: id === BERTOLDSHEIM ? 392.5 : 95 });
  }
  await world.monitor.runCycle();
  for (const language of LANGUAGES) {
    const widget = await content(world, {}, language);
    assert.deepEqual(validateWidgetContent(widget), [], language);
    assert.equal(widget.components.find((c) => c.type === 'status').items.length, 4);
  }
  const widget = await content(world, {}, 'de');
  const [muenchen, bachum, reservoir, trier] = widget.components.find(
    (c) => c.type === 'status',
  ).items;
  assert.deepEqual(muenchen, {
    label: 'München / Isar',
    value: '95 cm',
    color: WIDGET_COLORS.SUCCESS,
    icon: 'clock',
  });
  assert.equal(bachum.value, '95 cm');
  assert.deepEqual([reservoir.value, reservoir.color], ['392,5 m', WIDGET_COLORS.NEUTRAL]);
  assert.deepEqual([trier.value, trier.color], ['Still seit 24.10., 01:00', WIDGET_COLORS.NEUTRAL]);
  assert.match(
    widget.components.find((c) => c.type === 'text').text,
    /^Quelle: Hochwasserportale der Länder · /,
  );
  assert.deepEqual(widget.components.at(-1).link, { url: 'https://www.hochwasserzentralen.de/' });
});

test('an alert adds a heading and colours the station; the trend shows', async (t) => {
  const { world } = await worldWith(t, [MUENCHEN, TRIER]);
  for (const [level, stage] of [
    [200, 1],
    [240, 1],
    [280, 2],
    [320, 2],
    [360, 3],
  ]) {
    await cycle(world, 15);
    world.api.set(MUENCHEN, { t: world.clock.now(), W: level, stage });
  }
  await cycle(world, 1);
  const widget = await content(world, {}, 'en');
  assert.deepEqual(validateWidgetContent(widget), []);
  assert.deepEqual(widget.components[0], {
    type: 'text',
    variant: 'heading',
    text: 'Flood alert: München / Isar',
  });
  const [muenchen] = widget.components.find((c) => c.type === 'status').items;
  assert.deepEqual(muenchen, {
    label: 'München / Isar',
    value: '360 cm, rising',
    color: WIDGET_COLORS.DANGER,
    icon: 'trending-up',
  });
});

test('the detail of a station: bound tiles, alert level, trend, last reading', async (t) => {
  const { world, devices } = await worldWith(t, [MUENCHEN, BACHUM]);
  for (const language of LANGUAGES) {
    for (const device of devices) {
      const widget = await content(world, { station: device.external_id }, language);
      assert.deepEqual(validateWidgetContent(widget), [], `${language} ${device.name}`);
      for (const tile of widget.components.filter((c) => c.device_feature)) {
        assert.ok(features(devices).has(tile.device_feature), tile.device_feature);
      }
    }
  }
  const widget = await content(world, { station: devices[0].external_id }, 'fr');
  assert.deepEqual(
    widget.components.filter((c) => c.type === 'value').map((c) => c.label),
    ["Hauteur d'eau", 'Débit'],
  );
  assert.deepEqual(
    widget.components.find((c) => c.type === 'status').items.map((i) => [i.label, i.value]),
    [
      ["Niveau d'alerte", 'pas de crue'],
      ['Tendance', 'Inconnu'],
      ['Dernière mesure', '24/10 01:00'],
    ],
  );
  assert.match(widget.components.find((c) => c.type === 'text').text, /^Source : Bayern · /);
  assert.deepEqual(widget.components.at(-1).link, {
    url: 'https://www.hnd.bayern.de/pegel/isar/muenchen-16005701',
  });
  const bachum = await content(world, { station: devices[1].external_id }, 'es');
  assert.deepEqual(
    bachum.components.filter((c) => c.type === 'value').map((c) => c.label),
    ['Nivel del agua'],
  );
});

test('no station yet, and a station no longer followed', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const empty = await content(world, {}, 'de');
  assert.match(empty.components[0].text, /^Noch keine Station/);
  const gone = await content(world, { station: 'lhp:station:nope' }, 'en');
  assert.equal(gone.components[0].text, 'This station is no longer followed.');
});

test('a status value never exceeds 40 characters', () => {
  const view = { lastReadingAt: Date.parse('2026-10-23T13:00:00Z'), height: null, unit: 'cm' };
  for (const language of LANGUAGES) {
    assert.ok(stationValue(view, language).length <= 40);
  }
  assert.equal(stationValue({ lastReadingAt: null }, 'fr'), 'En attente');
});
