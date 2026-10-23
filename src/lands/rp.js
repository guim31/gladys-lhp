// -----------------------------------------------------------------------------
// Rheinland-Pfalz: Hochwassermeldedienst (LfU), JSON API of hochwasser.rlp.de.
//   /api/v1/config                    every measurement site, the rivers, the
//                                     river areas (for the page address) and
//                                     the thresholds by site:
//                                     legends.thresholds[id].W["22"…"19"] =
//                                     alert levels 1 to 4, in cm
//   /api/v1/measurement-site/<number> the site: W and Q with their last value
//                                     (yLast) and its UTC date (xLast)
// The coordinates are UTM (easting/northing): the LHP map gives them instead.
// -----------------------------------------------------------------------------

import { getJson } from '../http.js';
import { makeStation, parseIsoDate, point, stageOf, threshold, toNumber } from './common.js';

export const CODE = 'RP';
export const API_URL = 'https://hochwasser.rlp.de/api/v1';
export const SITE_URL = 'https://www.hochwasser.rlp.de/';

const THRESHOLD_KEYS = ['22', '21', '20', '19'];

/** The stations of the configuration document. */
export function parseConfig(body) {
  const sites = body?.measurementsite;
  if (!sites || typeof sites !== 'object') {
    throw new Error('Rheinland-Pfalz: unexpected answer for the station list');
  }
  const stations = [];
  for (const [key, site] of Object.entries(sites)) {
    if (!site?.number || !site.name || !['default', 'municipal'].includes(site.type)) {
      continue;
    }
    const river =
      site.type === 'default'
        ? body.rivers?.[site.rivers?.[0]]?.name
        : (site.riverMunicipalName ?? '');
    const area = body.riverareas?.[String(site.riverAreas?.[0])]?.slug;
    const prefix = site.type === 'default' ? `${SITE_URL}flussgebiet/` : SITE_URL;
    const levels = THRESHOLD_KEYS.map((code) =>
      threshold(body.legends?.thresholds?.[key]?.W?.[code]),
    );
    const thresholds = levels.some((value) => value !== null) ? levels : null;
    stations.push(
      makeStation(CODE, site.number, {
        name: String(site.name).trim(),
        river: String(river ?? '').trim(),
        url: area && site.slug ? `${prefix}${area}/${site.slug}` : SITE_URL,
        unit: 'cm',
        flow: false,
        alerts: thresholds !== null,
        thresholds,
      }),
    );
  }
  return stations;
}

const lastOf = (series) =>
  series ? point(parseIsoDate(series.xLast), toNumber(series.yLast)) : null;

/** The current values of a measurement site document. */
export function parseSite(body, station) {
  const W = lastOf(body?.W);
  const Q = lastOf(body?.Q);
  return {
    flow: Boolean(body?.Q),
    current: { W, Q, stage: stageOf(W?.v ?? null, station.thresholds) },
  };
}

export const portal = {
  code: CODE,
  name: 'Rheinland-Pfalz',
  site: SITE_URL,
  bulk: false,
  async list(fetchImpl) {
    return parseConfig(await getJson(fetchImpl, `${API_URL}/config`));
  },
  async read(fetchImpl, station) {
    const body = await getJson(
      fetchImpl,
      `${API_URL}/measurement-site/${encodeURIComponent(station.number)}`,
    );
    return parseSite(body, station);
  },
};
