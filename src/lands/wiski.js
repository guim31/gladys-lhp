// -----------------------------------------------------------------------------
// Nordrhein-Westfalen (LANUK) and Hessen (HLNUG) publish their gauges with the
// same software (KISTERS WISKI web public), as static JSON files:
//   <base>/stations.json                              every station
//   <base>/<site_no>/<station_no>/<P>/week.json       a week of one parameter
//   <base>/<site_no>/<station_no>/W/alarmlevel.json   alert thresholds (Hessen)
// A week.json is an array of series { ts_name, ts_unitsymbol, data: [[iso,
// value], …] }, oldest first; the dates carry their offset.
//
// One request per followed gauge and parameter at each cycle (the portals have
// no file with every current value). The thresholds of Hessen are read once a
// day.
// -----------------------------------------------------------------------------

import { HttpError, getJson } from '../http.js';
import { makeStation, parseIsoDate, point, stageOf, threshold, toNumber } from './common.js';

const DAY = 24 * 60 * 60 * 1000;

/** The newest value of a series of a week.json ({ t, v } or null). */
export function latest(series) {
  const data = Array.isArray(series?.data) ? series.data : [];
  for (let index = data.length - 1; index >= 0; index -= 1) {
    const [time, value] = data[index] ?? [];
    const reading = point(parseIsoDate(time), toNumber(value));
    if (reading) {
      return reading;
    }
  }
  return null;
}

/**
 * The series named `tsName` of a week.json (null when missing: the other
 * series of Hessen are forecasts), or the first one when no name is asked.
 */
export function seriesOf(body, tsName) {
  if (!Array.isArray(body)) {
    return null;
  }
  return tsName ? (body.find((series) => series?.ts_name === tsName) ?? null) : (body[0] ?? null);
}

/** A week.json, or null when the station does not publish that parameter (404). */
async function week(fetchImpl, url) {
  try {
    return await getJson(fetchImpl, url);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * A WISKI portal.
 * @param {object} options
 * @param {string} options.code   'NW', 'HE'
 * @param {string} options.name   name of the state
 * @param {string} options.site   public site
 * @param {string} options.base   base URL of the stations
 * @param {string} options.levelParameter  folder of the water level ('S' or 'W')
 * @param {string|null} options.levelSeries ts_name of the 15-minute level series
 * @param {string|null} options.flowParameter folder of the flow, or null
 * @param {Function} options.page  public page of a raw station
 * @param {Function} [options.thresholds] thresholds from a raw station, if the list has them
 * @param {boolean} [options.alarmlevels] read W/alarmlevel.json (Meldestufe1..3)
 */
export function wiskiPortal(options) {
  const meta = new Map();

  const toStation = (raw) => {
    const thresholds = options.thresholds?.(raw) ?? null;
    const station = makeStation(options.code, raw.station_no, {
      name: String(raw.station_name).trim(),
      river: String(raw.WTO_OBJECT ?? '').trim(),
      latitude: toNumber(raw.station_latitude),
      longitude: toNumber(raw.station_longitude),
      url: options.page(raw),
      unit: 'cm',
      flow: false,
      alerts: thresholds !== null,
      thresholds,
    });
    // Where the files of the station are, for read().
    station.path = `${options.base}/${encodeURIComponent(raw.site_no)}/${encodeURIComponent(raw.station_no)}`;
    return station;
  };

  return {
    code: options.code,
    name: options.name,
    site: options.site,
    bulk: false,

    async list(fetchImpl) {
      const body = await getJson(fetchImpl, `${options.base}/stations.json`);
      if (!Array.isArray(body)) {
        throw new Error(`${options.name}: unexpected answer for the station list`);
      }
      // Stations on a river: the others are rain or climate stations.
      return body
        .filter((raw) => raw?.station_no && raw.station_name && String(raw.WTO_OBJECT ?? '').trim())
        .map(toStation);
    },

    /** The current values of one station of list(), and what it offers. */
    async read(fetchImpl, station, now = Date.now()) {
      const path = station.path;
      let known = meta.get(station.id);
      if (!known || now - known.at > DAY) {
        known = { at: now, thresholds: station.thresholds, flow: Boolean(options.flowParameter) };
        if (options.alarmlevels) {
          const body = await week(fetchImpl, `${path}/W/alarmlevel.json`);
          const levels = [1, 2, 3].map((n) =>
            threshold(latest(body?.find?.((series) => series?.ts_name === `Meldestufe${n}`))?.v),
          );
          known.thresholds = levels.some((value) => value !== null) ? [...levels, null] : null;
        }
        meta.set(station.id, known);
      }
      const levelBody = await week(fetchImpl, `${path}/${options.levelParameter}/week.json`);
      const W = latest(seriesOf(levelBody, options.levelSeries));
      let Q = null;
      if (known.flow) {
        const flowBody = await week(fetchImpl, `${path}/${options.flowParameter}/week.json`);
        Q = latest(seriesOf(flowBody, options.levelSeries));
        if (!flowBody) {
          // No flow at this gauge: not asked again before tomorrow.
          known.flow = false;
        }
      }
      return {
        flow: known.flow,
        alerts: known.thresholds !== null,
        thresholds: known.thresholds,
        current: { W, Q, stage: stageOf(W?.v ?? null, known.thresholds) },
      };
    },
  };
}

export const NW_BASE = 'https://www.hochwasserportal.nrw/data/internet/stations';
export const HE_BASE = 'https://www.hlnug.de/static/pegel/wiskiweb3/data/internet/stations';

export const nw = wiskiPortal({
  code: 'NW',
  name: 'Nordrhein-Westfalen',
  site: 'https://www.hochwasserportal.nrw',
  base: NW_BASE,
  levelParameter: 'S',
  levelSeries: null,
  flowParameter: null,
  page: (raw) =>
    `https://www.hochwasserportal.nrw/webpublic/index.html#/overview/Wasserstand/station/${encodeURIComponent(raw.station_id)}/${encodeURIComponent(raw.station_name)}`,
  // The three information levels (Informationswerte) of North Rhine-Westphalia.
  thresholds: (raw) => {
    const levels = [raw.LANUV_Info_1, raw.LANUV_Info_2, raw.LANUV_Info_3].map(threshold);
    return levels.some((value) => value !== null) ? [...levels, null] : null;
  },
});

export const he = wiskiPortal({
  code: 'HE',
  name: 'Hessen',
  site: 'https://www.hlnug.de/static/pegel/wiskiweb3/webpublic/',
  base: HE_BASE,
  levelParameter: 'W',
  levelSeries: '15.P',
  flowParameter: 'Q',
  page: (raw) =>
    `https://www.hlnug.de/static/pegel/wiskiweb3/webpublic/#/overview/Wasserstand/station/${encodeURIComponent(raw.station_id)}/${encodeURIComponent(raw.station_name)}/Wasserstand`,
  alarmlevels: true,
});
