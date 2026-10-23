// -----------------------------------------------------------------------------
// The Länderübergreifendes Hochwasserportal (LHP) is the joint portal of the
// flood centres of the German states: its map (hochwasserzentralen.de) shows
// the alert level of their gauges, but the water levels themselves stay on the
// portal of each state. This module puts the state portals of src/lands/
// behind one interface:
//
//   referential()   every station of the supported states (names, rivers,
//                   units, thresholds), each state list kept a week in memory
//   read(stations)  the current values of the given stations: ONE request per
//                   "bulk" state (Bayern, Baden-Württemberg, Sachsen: one
//                   document holds every gauge), one per station and
//                   parameter elsewhere (Nordrhein-Westfalen, Hessen,
//                   Rheinland-Pfalz)
//   coordinates()   latitude and longitude of the gauges of the LHP map, for
//                   the states whose portal gives none (Bayern, Sachsen,
//                   Rheinland-Pfalz): only their flood reporting gauges
//
// The LHP map document (webservices/get_lagepegel.php) needs the number its
// home page passes to it (`addLagePegel(…)`): read from the page, then cached.
// A state that fails does not stop the others.
// -----------------------------------------------------------------------------

import { HttpError, getJson, getText } from './http.js';
import { portal as BY } from './lands/by.js';
import { portal as BW } from './lands/bw.js';
import { toNumber } from './lands/common.js';
import { portal as RP } from './lands/rp.js';
import { portal as SN } from './lands/sn.js';
import { he as HE, nw as NW } from './lands/wiski.js';

export const PORTALS = { BW, BY, HE, NW, RP, SN };
export const LANDS = Object.keys(PORTALS);

export const LHP_URL = 'https://www.hochwasserzentralen.de/';
export const MAP_URL = `${LHP_URL}webservices/get_lagepegel.php`;

// Station ids: "<state>_<number>", as the Home Assistant integration writes them.
export const STATION_ID = /^([A-Z]{2})_([\w-]+)$/;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** The LHP map document → Map id → { latitude, longitude }. */
export function parseMap(body) {
  const ids = Array.isArray(body?.PGNR) ? body.PGNR : [];
  const coordinates = new Map();
  ids.forEach((id, index) => {
    const latitude = toNumber(body.LAT?.[index]);
    const longitude = toNumber(body.LON?.[index]);
    if (typeof id === 'string' && latitude !== null && longitude !== null) {
      coordinates.set(id, { latitude, longitude });
    }
  });
  return coordinates;
}

/** The number the LHP home page passes to its gauge map, or null. */
export function mapKeyOf(html) {
  return /addLagePegel\(\s*['"]?(\d+)['"]?\s*\)/.exec(String(html))?.[1] ?? null;
}

export class Lhp {
  /**
   * @param {object} [options]
   * @param {Function} [options.fetch]
   * @param {Function} [options.now] clock in ms
   */
  constructor({ fetch: fetchImpl, now } = {}) {
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.now = now ?? (() => Date.now());
    // By state: { stations, at } of the last list, and the time of the last failure.
    this.lists = {};
    this.failedAt = {};
    this.map = null;
    this.mapFailedAt = -Infinity;
  }

  /** The list of a state, downloaded again when older than `maxAgeMs`. */
  async list(code, maxAgeMs = WEEK) {
    const cached = this.lists[code];
    const now = this.now();
    if (cached && now - cached.at < maxAgeMs) {
      return cached.stations;
    }
    const stations = await PORTALS[code].list(this.fetch);
    this.lists[code] = { stations, at: now };
    return stations;
  }

  /**
   * Every station of the given states. A state that fails is retried after an
   * hour and listed in `failed`, its old list serving meanwhile.
   * @returns {Promise<{ stations: object[], failed: { code: string, error: Error }[] }>}
   */
  async referential(codes = LANDS) {
    const failed = [];
    const lists = await Promise.all(
      codes.map(async (code) => {
        if (this.now() - (this.failedAt[code] ?? -Infinity) < HOUR) {
          failed.push({ code, error: new Error('retried later') });
          return this.lists[code]?.stations ?? [];
        }
        try {
          return await this.list(code);
        } catch (err) {
          this.failedAt[code] = this.now();
          failed.push({ code, error: err });
          return this.lists[code]?.stations ?? [];
        }
      }),
    );
    const coordinates = await this.coordinates();
    const stations = lists.flat().map((station) => {
      if (station.latitude !== null && station.longitude !== null) {
        return station;
      }
      const place = coordinates.get(station.id);
      return place ? { ...station, ...place } : station;
    });
    return { stations, failed };
  }

  /** Coordinates of the LHP map, kept a week; an empty map when unavailable. */
  async coordinates() {
    const now = this.now();
    if (this.map && now - this.map.at < WEEK) {
      return this.map.coordinates;
    }
    if (now - this.mapFailedAt < HOUR) {
      return this.map?.coordinates ?? new Map();
    }
    try {
      const key = mapKeyOf(await getText(this.fetch, LHP_URL, { accept: 'text/html' }));
      if (!key) {
        throw new Error('the LHP home page has changed');
      }
      const body = await getJson(this.fetch, MAP_URL, { form: { ki: key } });
      this.map = { coordinates: parseMap(body), at: now };
    } catch {
      // Only "around my house" and the distances of the search need it.
      this.mapFailedAt = now;
    }
    return this.map?.coordinates ?? new Map();
  }

  /**
   * The current values of the given stations (from the referential, or as
   * stored), by id: `{ current, flow?, alerts?, thresholds? }` to merge into
   * the station. Ids a state does not know are missing from `readings`.
   * @returns {Promise<{ readings: Map<string, object>, failed: { code: string, error: Error }[], unknown: string[] }>}
   */
  async read(stations) {
    const readings = new Map();
    const failed = [];
    const unknown = [];
    const byLand = new Map();
    for (const station of stations) {
      if (PORTALS[station.land]) {
        byLand.set(station.land, [...(byLand.get(station.land) ?? []), station]);
      } else {
        unknown.push(station.id);
      }
    }
    await Promise.all(
      [...byLand].map(async ([code, wanted]) => {
        const portal = PORTALS[code];
        try {
          if (portal.bulk) {
            // The list is the reading: always downloaded again.
            const all = new Map((await this.list(code, 0)).map((item) => [item.id, item]));
            for (const station of wanted) {
              const found = all.get(station.id);
              if (found) {
                readings.set(station.id, found);
              } else {
                unknown.push(station.id);
              }
            }
            return;
          }
          let known = null;
          for (const station of wanted) {
            let target = station;
            if (station.rebuilt || (code !== 'RP' && !station.path)) {
              // A station rebuilt from its device: where its files are is in the list.
              known ??= new Map((await this.list(code)).map((item) => [item.id, item]));
              const listed = known.get(station.id);
              if (!listed) {
                unknown.push(station.id);
                continue;
              }
              target = { ...station, ...listed };
            }
            try {
              const update = await portal.read(this.fetch, target, this.now());
              const { rebuilt: _rebuilt, ...known } = target;
              readings.set(station.id, { ...known, ...update });
            } catch (err) {
              if (err instanceof HttpError && err.status === 404) {
                unknown.push(station.id);
              } else {
                throw err;
              }
            }
          }
        } catch (err) {
          failed.push({ code, error: err });
        }
      }),
    );
    return { readings, failed, unknown };
  }
}
