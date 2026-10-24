// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, fake state portals serving the
// recorded answers of test/fixtures/lhp (real answers of 24/10/2026, cut down
// to a few gauges), a manual clock, a temporary /data, and the integration
// wired on top through registerHandlers. Nothing touches the network.
//
// `api.set(id, { t, W, Q, stage })` writes a new reading into the recorded
// answer, in the format of its state (HTML attributes in Bayern, a row of the
// script in Baden-Württemberg, the pop-up in Sachsen, a point of the series in
// Nordrhein-Westfalen and Hessen, the last value in Rheinland-Pfalz).
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { parseRow } from '../../src/lands/bw.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'Europe/Berlin';

const DIR = new URL('../fixtures/lhp/', import.meta.url);
export const text = (name) => readFileSync(new URL(name, DIR), 'utf8');
export const json = (name) => JSON.parse(text(name));

// The recorded readings end at 01:00 or 01:05 (German summer time) on
// 24/10/2026, i.e. 23:00 UTC on 23/10: the clock starts 20 minutes later.
export const START = Date.parse('2026-10-23T23:20:00Z');

// A house in München (public coordinates of the Marienplatz).
export const HOUSE = {
  id: 'house-1',
  name: 'Haus',
  selector: 'haus',
  latitude: 48.1374,
  longitude: 11.5755,
};

// Isar, level in cm, flow, Meldestufe 0 (coordinates from the LHP map).
export const MUENCHEN = 'BY_16005701';
// Iller, level, flow, Meldestufe 0.
export const KEMPTEN = 'BY_11402001';
// Danube, flow only.
export const NEU_ULM_Q = 'BY_10026302';
// Danube, level of a reservoir in m above sea level, no alert level.
export const BERTOLDSHEIM = 'BY_10041906';
// Untere Argen, level, flow, thresholds of the four alert levels.
export const RENGERS = 'BW_00076';
// Elbe, alert gauge, level 0 ("Niedrigwasser").
export const SCHOENA = 'SN_501010';
// Ruhr, three information levels, no flow.
export const BACHUM = 'NW_2763190000100';
// Lahn, three Meldestufen (alarmlevel.json), flow.
export const MARBURG = 'HE_25830056';
// Mosel, four alert levels, flow.
export const TRIER = 'RP_26500100';

const BW_URL = 'https://www.hvz.baden-wuerttemberg.de/js/hvz_peg_stmn.js';
const NW = 'https://www.hochwasserportal.nrw/data/internet/stations';
const HE = 'https://www.hlnug.de/static/pegel/wiskiweb3/data/internet/stations';
const RP = 'https://hochwasser.rlp.de/api/v1';

/** A time as the German portals write it, in German local time. */
function germanParts(time) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    })
      .formatToParts(new Date(time))
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.day}.${parts.month}.${parts.year}`;
  return {
    date,
    hour: `${parts.hour}:${parts.minute}`,
    summer: ['CEST', 'GMT+2'].includes(parts.timeZoneName),
  };
}
const german = (n) => String(n).replace('.', ',');
const iso = (time) => new Date(time).toISOString();

/** Fake state portals. `api.down`: { BY: 'network' | 503 … } by state, or all with '*'. */
export function createApi() {
  const files = {
    by: text('by-pegel-2026-10-24.html'),
    bw: text('bw-hvz_peg_stmn-2026-10-24.txt'),
    sn: text('sn-wasserstand-uebersicht-2026-10-24.html'),
    nwStations: json('nw-stations-2026-10-24.json'),
    nwWeek: json('nw-2763190000100-S-week-2026-10-24.json'),
    heStations: json('he-stations-2026-10-24.json'),
    heW: json('he-25830056-W-week-2026-10-24.json'),
    heQ: json('he-25830056-Q-week-2026-10-24.json'),
    heAlarm: json('he-25830056-W-alarmlevel-2026-10-24.json'),
    rpConfig: json('rp-config-2026-10-24.json'),
    rpTrier: json('rp-26500100-site-2026-10-24.json'),
    rpAuw: json('rp-1034232320-site-2026-10-24.json'),
    lhpHome: text('lhp-home-2026-10-24.html'),
    lhpMap: json('lhp-get_lagepegel-2026-10-24.json'),
  };

  const routes = () => ({
    'https://www.hnd.bayern.de/pegel': ['BY', files.by],
    [BW_URL]: ['BW', files.bw],
    'https://www.umwelt.sachsen.de/umwelt/infosysteme/hwims/portal/web/wasserstand-uebersicht': [
      'SN',
      files.sn,
    ],
    [`${NW}/stations.json`]: ['NW', files.nwStations],
    [`${NW}/100/2763190000100/S/week.json`]: ['NW', files.nwWeek],
    [`${HE}/stations.json`]: ['HE', files.heStations],
    [`${HE}/0/25830056/W/week.json`]: ['HE', files.heW],
    [`${HE}/0/25830056/Q/week.json`]: ['HE', files.heQ],
    [`${HE}/0/25830056/W/alarmlevel.json`]: ['HE', files.heAlarm],
    [`${RP}/config`]: ['RP', files.rpConfig],
    [`${RP}/measurement-site/26500100`]: ['RP', files.rpTrier],
    [`${RP}/measurement-site/1034232320`]: ['RP', files.rpAuw],
    'https://www.hochwasserzentralen.de/': ['LHP', files.lhpHome],
    'https://www.hochwasserzentralen.de/webservices/get_lagepegel.php': ['LHP', files.lhpMap],
  });

  const setters = {
    BY(number, { t, W, Q, stage }) {
      files.by = files.by.replace(new RegExp(`<img [^>]*id="p${number}"[^>]*>`), (tag) => {
        const { date, hour } = germanParts(t);
        let result = tag.replace(/data-datum="[^"]*"/, `data-datum="${date}, ${hour}"`);
        if (W !== undefined) {
          result = result.replace(/data-wert="[^"]*"/, `data-wert="${german(W)}"`);
        }
        if (Q !== undefined) {
          result = result.replace(/data-wert2="[^"]*"/, `data-wert2="${german(Q)}"`);
        }
        if (stage !== undefined) {
          result = result.replace(/data-ms="[^"]*"/, `data-ms="${stage}"`);
        }
        return result;
      });
    },
    BW(number, { t, W, Q }) {
      files.bw = files.bw
        .split('\r\n')
        .map((line) => {
          if (!line.startsWith(` ['${number}'`)) {
            return line;
          }
          const row = parseRow(line);
          const { date, hour, summer } = germanParts(t);
          const stamp = `${date} ${hour} ${summer ? 'MESZ' : 'MEZ'}`;
          if (W !== undefined) {
            row[4] = String(W);
            row[6] = stamp;
          }
          if (Q !== undefined) {
            row[7] = String(Q);
            row[9] = stamp;
          }
          const cells = row.map((value) =>
            typeof value === 'number' ? String(value) : `'${value.replace(/'/g, "\\'")}'`,
          );
          return ` [${cells.join(',')}],`;
        })
        .join('\r\n');
    },
    SN(number, { t, W, Q, stage }) {
      const start = files.sn.indexOf(`<a href="wasserstand-pegel-${number}"`);
      const next = files.sn.indexOf('<a href="wasserstand-pegel-', start + 10);
      const end = next === -1 ? files.sn.length : next;
      const { date, hour } = germanParts(t);
      const colours = ['#c5e566', '#ffeb3b', '#fb8a00', '#e53835', '#d400f9'];
      let block = files.sn.slice(start, end);
      block = block.replace(
        /(Datum:<\/span>\s*<span class="popUpValue">)[^<]*<br \/>[^<]*/,
        `$1${date}<br />${hour}`,
      );
      if (W !== undefined) {
        block = block.replace(/(Wasserstand:<\/span>\s*<span class="popUpValue">)[^<]*/, `$1${W}`);
      }
      if (Q !== undefined) {
        block = block.replace(
          /(Durchfluss:<\/span>\s*<span class="popUpValue">)[^<]*/,
          `$1${german(Q)}`,
        );
      }
      if (stage !== undefined) {
        block = block.replace(
          /<div class="popUpStatus" style="background-color: #\w+">\s*<div>[^<]*<\/div>/,
          `<div class="popUpStatus" style="background-color: ${colours[stage]}">\n            <div>${stage === 0 ? 'Kein Hochwasser' : `Alarmstufe ${stage}`}</div>`,
        );
      }
      files.sn = files.sn.slice(0, start) + block + files.sn.slice(end);
    },
    NW(number, { t, W }) {
      files.nwWeek[0].data.push([iso(t), W]);
    },
    HE(number, { t, W, Q }) {
      if (W !== undefined) {
        files.heW.find((series) => series.ts_name === '15.P').data.push([iso(t), W]);
      }
      if (Q !== undefined) {
        files.heQ.find((series) => series.ts_name === '15.P').data.push([iso(t), Q]);
      }
    },
    RP(number, { t, W, Q }) {
      const site = number === '26500100' ? files.rpTrier : files.rpAuw;
      const stamp = iso(t).replace(/\.\d{3}Z$/, 'Z');
      if (W !== undefined) {
        Object.assign(site.W, { xLast: stamp, yLast: W });
      }
      if (Q !== undefined && site.Q) {
        Object.assign(site.Q, { xLast: stamp, yLast: Q });
      }
    },
  };

  const api = {
    files,
    down: {},
    requests: [],

    /** A new reading of a station (see the header). */
    set(id, reading) {
      const [land, number] = id.split('_');
      setters[land](number, reading);
    },

    async fetch(input, init = {}) {
      const url = String(input);
      api.requests.push({ url, method: init.method ?? 'GET', body: init.body ?? null });
      const route = routes()[url];
      const failure = api.down[route?.[0]] ?? api.down['*'];
      if (failure === 'network') {
        throw new TypeError('fetch failed');
      }
      if (failure) {
        return { status: failure, text: async () => 'Service Unavailable' };
      }
      if (!route) {
        return { status: 404, text: async () => 'Not Found' };
      }
      const body = route[1];
      return {
        status: 200,
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
      };
    },
  };
  return api;
}

/** A manual clock. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {Array} [options.houses] houses of Gladys
 * @param {object} [options.api] from createApi
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers] true: the monitor's own timer runs (mock it)
 */
export async function createWorld({
  config = {},
  devices = [],
  houses = [HOUSE],
  api = createApi(),
  connect = true,
  timers = false,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-lhp-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices, houses });
  const store = new Store(dataDir);
  const app = registerHandlers(gladys, {
    store,
    fetch: api.fetch,
    timers,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
    await app.monitor.running;
  }
  return { gladys, fake: gladys.fake, app, monitor: app.monitor, api, clock, store, dataDir };
}

/** The device published for a station id, from the last discovery list. */
export const discovered = (world, id) =>
  world.fake.discoveredDevices.find((device) =>
    device.params.some((p) => p.name === 'STATION_ID' && p.value === id),
  );

/** Create the device of a station in Gladys, as the user would. */
export async function create(world, id) {
  const device = discovered(world, id);
  if (!device) {
    throw new Error(`${id} is not in the discovered devices`);
  }
  await world.fake.deviceCreated(device);
  return device;
}

/** External id of one feature of a device. */
export const featureId = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`))?.external_id;

/** Run one refresh cycle, `minutes` later. */
export async function cycle(world, minutes = 15) {
  world.clock.advance(minutes * 60 * 1000);
  await world.monitor.runCycle();
}

/**
 * Capture the integration's log lines at `level` and above (LOG_LEVEL is read
 * at every call). Returns the lines as `{ level, text }`.
 */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const line = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(line);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text: line });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
