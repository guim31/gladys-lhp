// -----------------------------------------------------------------------------
// The state portals, on their recorded answers (test/fixtures/lhp, 24/10/2026):
// what each format gives, German dates, alert levels from thresholds, the LHP
// map, and the HTTP helper.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, USER_AGENT, getJson, getText } from '../src/http.js';
import { parse as parseBy } from '../src/lands/by.js';
import { parse as parseBw } from '../src/lands/bw.js';
import { germanTime, parseGermanDate, stageOf, toNumber } from '../src/lands/common.js';
import { parseConfig, parseSite } from '../src/lands/rp.js';
import { parse as parseSn } from '../src/lands/sn.js';
import { latest, nw, seriesOf } from '../src/lands/wiski.js';
import { Lhp, mapKeyOf, parseMap } from '../src/lhp.js';
import { createApi, json, text } from './helpers/world.js';

const byId = (stations) => new Map(stations.map((station) => [station.id, station]));
const at = (isoText) => Date.parse(isoText);

test('German numbers and dates: comma, MEZ/MESZ, local time around the change of time', () => {
  assert.equal(toNumber('20,90'), 20.9);
  assert.equal(toNumber('1.234,5'), 1234.5);
  assert.equal(toNumber('0.29'), 0.29);
  assert.equal(toNumber('1.050'), 1.05, 'a decimal point by default (BW, WISKI)');
  assert.equal(toNumber('1.050', { german: true }), 1050, 'thousands in the HTML pages');
  assert.equal(toNumber('20,90', { german: true }), 20.9);
  assert.equal(toNumber('--'), null);
  assert.equal(toNumber(''), null);
  assert.equal(parseGermanDate('24.10.2026, 01:00'), at('2026-10-23T23:00:00Z'));
  assert.equal(parseGermanDate('24.10.2026 01:00 MESZ'), at('2026-10-23T23:00:00Z'));
  assert.equal(parseGermanDate('15.01.2026 01:00 MEZ'), at('2026-01-15T00:00:00Z'));
  assert.equal(parseGermanDate('15.01.2026 01:00 Uhr'), at('2026-01-15T00:00:00Z'));
  assert.equal(germanTime(2026, 10, 25, 12, 0), at('2026-10-25T11:00:00Z'));
  assert.equal(germanTime(2026, 3, 29, 12, 0), at('2026-03-29T10:00:00Z'));
  assert.equal(parseGermanDate('soon'), null);
});

test('alert levels from thresholds: the highest one reached', () => {
  const thresholds = [190, 242, 258, 277];
  assert.equal(stageOf(33, thresholds), 0);
  assert.equal(stageOf(189, thresholds), 0);
  assert.equal(stageOf(190, thresholds), 1, 'a Meldestufe applies from its threshold on');
  assert.equal(stageOf(260, thresholds), 3);
  assert.equal(stageOf(500, thresholds), 4);
  assert.equal(stageOf(449, [400, 450, 480, null]), 1);
  assert.equal(stageOf(500, [400, 450, 480, null]), 3);
  assert.equal(stageOf(100, null), null);
  assert.equal(stageOf(null, thresholds), null);
});

test('Bayern: one page, level in cm, reservoir in m, flow only, Meldestufe', () => {
  const stations = byId(parseBy(text('by-pegel-2026-10-24.html')));
  assert.equal(stations.size, 4);
  const muenchen = stations.get('BY_16005701');
  assert.equal(muenchen.name, 'München');
  assert.equal(muenchen.river, 'Isar');
  assert.equal(muenchen.url, 'https://www.hnd.bayern.de/pegel/isar/muenchen-16005701');
  assert.deepEqual([muenchen.unit, muenchen.flow, muenchen.alerts], ['cm', true, true]);
  assert.deepEqual(muenchen.current, {
    W: { t: at('2026-10-23T23:00:00Z'), v: 90 },
    Q: { t: at('2026-10-23T23:00:00Z'), v: 20.9 },
    stage: 0,
  });
  const neuUlm = stations.get('BY_10026302');
  assert.equal(neuUlm.unit, null, 'flow only');
  assert.equal(neuUlm.current.W, null);
  assert.equal(neuUlm.current.Q.v, 44.8);
  assert.equal(neuUlm.alerts, false);
  const reservoir = stations.get('BY_10041906');
  assert.equal(reservoir.unit, 'm', 'art=s: m above sea level');
  assert.equal(reservoir.current.W.v, 392);
  assert.equal(reservoir.alerts, false);
});

test('Baden-Württemberg: one script, thresholds (HMO and levels 1 to 4), lake in m', () => {
  const stations = byId(parseBw(text('bw-hvz_peg_stmn-2026-10-24.txt')));
  assert.equal(stations.size, 4);
  const rengers = stations.get('BW_00076');
  assert.equal(rengers.name, 'Rengers');
  assert.equal(rengers.river, 'Untere Argen');
  assert.deepEqual(rengers.thresholds, [190, 242, 258, 277]);
  assert.equal(rengers.latitude, 47.715992);
  assert.equal(rengers.current.W.v, 33);
  assert.equal(rengers.current.W.t, at('2026-10-23T23:05:00Z'));
  assert.equal(rengers.current.Q.v, 0.29);
  assert.equal(rengers.current.stage, 0);
  assert.equal(rengers.url, 'https://www.hvz.baden-wuerttemberg.de/pegel.html?id=00076');
  const noLevel = stations.get('BW_09055');
  assert.equal(noLevel.unit, null);
  assert.equal(noLevel.current.W, null);
  assert.equal(noLevel.current.Q.v, 66.2);
  const lake = [...stations.values()].find((station) => station.unit === 'm');
  assert.ok(lake, 'a lake level in m');
  assert.equal(lake.alerts, false, 'thresholds in cm are not compared with m');
});

test('Sachsen: one page, alert gauges, a gauge without current data', () => {
  const stations = byId(parseSn(text('sn-wasserstand-uebersicht-2026-10-24.html')));
  assert.equal(stations.size, 3);
  const schoena = stations.get('SN_501010');
  assert.deepEqual([schoena.name, schoena.river], ['Schöna', 'Elbe']);
  assert.equal(schoena.alerts, true);
  assert.equal(schoena.current.stage, 0, '"Niedrigwasser" is level 0');
  assert.deepEqual(schoena.current.W, { t: at('2026-10-23T23:00:00Z'), v: 77 });
  assert.equal(schoena.current.Q.v, 90.6);
  const other = stations.get('SN_501040');
  assert.equal(other.alerts, false, 'not an alert gauge');
  assert.equal(other.current.stage, null);
  const silent = stations.get('SN_10000641');
  assert.equal(silent.current.W, null, 'no current data');
});

test('WISKI (NRW, Hessen): river stations only, newest value, information levels', async () => {
  const api = createApi();
  const nwStations = await nw.list(api.fetch);
  assert.equal(nwStations.length, 2, 'the rain station is left out');
  const bachum = nwStations.find((station) => station.id === 'NW_2763190000100');
  assert.deepEqual(bachum.thresholds, [210, 400, 440, null]);
  assert.equal(bachum.river, 'Ruhr');
  const reading = await nw.read(api.fetch, bachum, at('2026-10-23T23:20:00Z'));
  assert.equal(reading.current.W.v, 88.9);
  assert.equal(reading.current.W.t, at('2026-10-23T23:00:00Z'));
  assert.equal(reading.current.stage, 0);
  assert.equal(reading.flow, false);
  const week = json('he-25830056-W-week-2026-10-24.json');
  assert.equal(seriesOf(week, '15.P').ts_name, '15.P');
  assert.equal(latest(seriesOf(week, '15.P')).v, 146);
  assert.equal(latest({ data: [['2026-10-23T23:00:00.000+01:00', null]] }), null);
  assert.equal(seriesOf(week, '15.X'), null, 'never a forecast series instead');
});

test('Hessen: Meldestufen read from alarmlevel.json, flow from Q', async () => {
  const lhp = new Lhp({ fetch: createApi().fetch, now: () => at('2026-10-23T23:20:00Z') });
  const { readings } = await lhp.read([{ id: 'HE_25830056', land: 'HE', number: '25830056' }]);
  const marburg = readings.get('HE_25830056');
  assert.equal(marburg.name, 'Marburg');
  assert.deepEqual(marburg.thresholds, [400, 450, 480, null]);
  assert.equal(marburg.alerts, true);
  assert.equal(marburg.flow, true);
  assert.equal(marburg.current.W.v, 146);
  assert.equal(marburg.current.Q.v, 1.63);
});

test('Rheinland-Pfalz: configuration, a municipal gauge, last values in UTC', () => {
  const stations = byId(parseConfig(json('rp-config-2026-10-24.json')));
  const trier = stations.get('RP_26500100');
  assert.deepEqual([trier.name, trier.river], ['Trier', 'Mosel']);
  assert.deepEqual(trier.thresholds, [795, 1000, 1043, 1127]);
  assert.equal(trier.url, 'https://www.hochwasser.rlp.de/flussgebiet/mosel/trier');
  const site = parseSite(json('rp-26500100-site-2026-10-24.json'), trier);
  assert.equal(site.current.W.v, 221);
  assert.equal(site.current.W.t, at('2026-10-23T23:00:00Z'));
  assert.equal(site.flow, true);
  assert.equal(site.current.stage, 0);
  const auw = stations.get('RP_1034232320');
  assert.equal(auw.name, 'Auw an der Kyll');
  const auwSite = parseSite(json('rp-1034232320-site-2026-10-24.json'), auw);
  assert.equal(auwSite.flow, false);
  assert.equal(auwSite.current.W.v, 154);
});

test('the LHP map: key read from the home page, coordinates by station id', async () => {
  assert.equal(mapKeyOf(text('lhp-home-2026-10-24.html')), '899247162101');
  assert.equal(mapKeyOf('<html></html>'), null);
  const coordinates = parseMap(json('lhp-get_lagepegel-2026-10-24.json'));
  assert.deepEqual(coordinates.get('BY_16005701'), { latitude: 48.1454, longitude: 11.5968 });
  const api = createApi();
  const lhp = new Lhp({ fetch: api.fetch });
  const { stations, failed } = await lhp.referential();
  assert.deepEqual(failed, []);
  const muenchen = stations.find((station) => station.id === 'BY_16005701');
  assert.equal(muenchen.latitude, 48.1454, 'Bayern gives no coordinates: the LHP map does');
  const post = api.requests.find((request) => request.method === 'POST');
  assert.equal(post.body, 'ki=899247162101');
  assert.deepEqual([...new Set(stations.map((station) => station.land))].sort(), [
    'BW',
    'BY',
    'HE',
    'NW',
    'RP',
    'SN',
  ]);
});

test('a state that fails does not stop the others', async () => {
  const api = createApi();
  api.down.SN = 503;
  const lhp = new Lhp({ fetch: api.fetch });
  const { readings, failed } = await lhp.read([
    { id: 'SN_501010', land: 'SN', number: '501010' },
    { id: 'BY_16005701', land: 'BY', number: '16005701' },
  ]);
  assert.deepEqual(
    failed.map((item) => item.code),
    ['SN'],
  );
  assert.ok(readings.has('BY_16005701'));
  const unknown = await lhp.read([
    { id: 'BY_1', land: 'BY', number: '1' },
    { id: 'RP_1', land: 'RP', number: '1', thresholds: null },
    { id: 'XX_1', land: 'XX', number: '1' },
  ]);
  assert.deepEqual(unknown.unknown.sort(), ['BY_1', 'RP_1', 'XX_1']);
});

test('HTTP: identifying User-Agent, form POST, failures as HttpError', async () => {
  const seen = [];
  const ok = async (url, init) => {
    seen.push(init);
    return { status: 200, text: async () => '{"a":1}' };
  };
  assert.deepEqual(await getJson(ok, 'https://example.org/x.json'), { a: 1 });
  assert.equal(seen[0].headers['User-Agent'], USER_AGENT);
  assert.match(USER_AGENT, /github\.com\/guim31\/gladys-lhp/);
  await getText(ok, 'https://example.org/f', { form: { ki: '1' } });
  assert.equal(seen[1].method, 'POST');
  assert.equal(seen[1].body, 'ki=1');
  const status = async () => ({ status: 503, text: async () => '' });
  await assert.rejects(getText(status, 'https://example.org/'), (err) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 503);
    return true;
  });
  const network = async () => {
    throw new TypeError('fetch failed');
  };
  await assert.rejects(getText(network, 'https://example.org/'), /example\.org: fetch failed/);
  const notJson = async () => ({ status: 200, text: async () => '<html>' });
  await assert.rejects(getJson(notJson, 'https://example.org/'), /not JSON/);
});

test('one station failing does not stop the others of its state', async () => {
  const api = createApi();
  const fetch = async (url, init) =>
    String(url).includes('/measurement-site/26500100')
      ? { status: 500, text: async () => '' }
      : api.fetch(url, init);
  const lhp = new Lhp({ fetch, now: () => at('2026-10-23T23:20:00Z') });
  const both = await lhp.read([
    { id: 'RP_26500100', land: 'RP', number: '26500100' },
    { id: 'RP_1034232320', land: 'RP', number: '1034232320' },
  ]);
  assert.deepEqual(both.failed, []);
  assert.ok(both.readings.has('RP_1034232320'));
  const alone = await lhp.read([{ id: 'RP_26500100', land: 'RP', number: '26500100' }]);
  assert.deepEqual(
    alone.failed.map((item) => item.code),
    ['RP'],
  );
});

test('the files and thresholds of a stored station come from the list again', async () => {
  const api = createApi();
  const lhp = new Lhp({ fetch: api.fetch, now: () => at('2026-10-23T23:20:00Z') });
  const stored = {
    id: 'NW_2763190000100',
    land: 'NW',
    number: '2763190000100',
    name: 'Bachum',
    path: 'https://old.example/stations/100/2763190000100',
    thresholds: [1, 2, 3, null],
  };
  const { readings } = await lhp.read([stored]);
  const bachum = readings.get('NW_2763190000100');
  assert.match(bachum.path, /^https:\/\/www\.hochwasserportal\.nrw\//);
  assert.deepEqual(bachum.thresholds, [210, 400, 440, null]);
  assert.equal(bachum.current.W.v, 88.9);
});
