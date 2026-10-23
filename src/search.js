// -----------------------------------------------------------------------------
// The "Find stations" configuration action: lists gauges with their id,
// river, distance from the house and current water level, so the user can copy
// their ids into the configuration.
//
// What can be typed:
//   - nothing: the gauges around the house (its location in Gladys), among
//     those whose coordinates are known (see src/lhp.js);
//   - a station id (BY_16005701) or a gauge number (16005701);
//   - words: matched against the station and river names and the id ("München",
//     "Isar", "Neckar Plochingen", "SN_"), accents, case and umlauts ignored.
//     The matches are listed nearest to the house first, else by river.
//
// The search is made on the station lists (downloaded once a week): the house
// coordinates never leave Gladys and the container.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { parseToken } from './config.js';
import { displayName } from './devices.js';
import { distanceKm } from './geo.js';
import { SEARCH, formatHeight, formatNumber, render } from './messages.js';
import { Monitor } from './monitor.js';

const logger = createLogger({ name: 'lhp-search' });

export const SEARCH_RADII = ['10', '20', '50', '100'];
const DEFAULT_RADIUS_KM = 20;
const MAX_RESULTS = 10;

/** Distance from the house to a station in km, null when one has no location. */
const distanceTo = (house, station) =>
  house && station.latitude !== null && station.longitude !== null
    ? distanceKm(house.latitude, house.longitude, station.latitude, station.longitude)
    : null;

/** The stations of a query with their distance, nearest first, else in river order. */
async function candidates(monitor, text, radiusKm, stations) {
  const house = await monitor.house();
  const query = text.trim();
  if (!query) {
    return house ? { list: Monitor.around(stations, house, radiusKm) } : { error: 'noHouse' };
  }
  const token = parseToken(query);
  let found;
  if (token.kind === 'id') {
    found = stations.filter((station) => station.id === token.value);
  } else if (token.kind === 'number') {
    found = stations.filter((station) => station.number === token.value);
  } else {
    const words = query.split(/\s+/).filter(Boolean);
    found = stations.filter((station) => Monitor.matches(station, words));
  }
  const list = found.map((station) => ({ station, km: distanceTo(house, station) }));
  // Known distances first, nearest first; then by river and name.
  list.sort(
    (a, b) =>
      (a.km === null) - (b.km === null) ||
      (a.km ?? 0) - (b.km ?? 0) ||
      (a.station.river ?? '').localeCompare(b.station.river ?? '') ||
      a.station.name.localeCompare(b.station.name),
  );
  return { list };
}

/**
 * Handler of the `search_stations` action.
 * @param {Monitor} monitor
 * @param {{ query?: string, radius?: string }} fields
 */
export async function searchStations(monitor, fields = {}) {
  const radiusKm = SEARCH_RADII.includes(String(fields.radius))
    ? Number(fields.radius)
    : DEFAULT_RADIUS_KM;
  try {
    const stations = await monitor.stationList();
    if (!stations) {
      return render(SEARCH, 'unavailable');
    }
    const found = await candidates(monitor, String(fields.query ?? ''), radiusKm, stations);
    if (found.error) {
      return render(SEARCH, found.error);
    }
    const total = found.list.length;
    const listed = found.list.slice(0, MAX_RESULTS);
    logger.info(`Station search: ${total} station(s) found`);
    if (listed.length === 0) {
      return render(SEARCH, 'none');
    }
    const live = await monitor.api
      .read(listed.map(({ station }) => station))
      .then(({ readings }) => readings)
      .catch(() => null);
    return Object.fromEntries(
      Object.keys(SEARCH).map((language) => {
        const texts = SEARCH[language];
        const lines = listed.map(({ station, km }) => {
          const parts = [`${station.id} — ${displayName(station)}`];
          if (km !== null) {
            parts.push(`${formatNumber(km, language, 1)} km`);
          }
          if (live) {
            const current = live.get(station.id);
            const W = current?.current?.W;
            if (W && monitor.isFresh(W.t)) {
              parts.push(formatHeight(W.v, current.unit, language));
            } else {
              parts.push(texts.noRecent);
            }
          }
          return parts.join(', ');
        });
        return [language, `${texts.found({ count: listed.length, total })}\n${lines.join('\n')}`];
      }),
    );
  } catch (err) {
    logger.warn(`Station search failed: ${err.message}`);
    return render(SEARCH, 'unavailable');
  }
}
