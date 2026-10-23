// -----------------------------------------------------------------------------
// Bayern: Hochwassernachrichtendienst (HND), Bayerisches Landesamt für Umwelt.
//
// ONE page, https://www.hnd.bayern.de/pegel, carries every gauge of the map as
// an <img class="bobbl"> whose data-* attributes hold the current values:
//   id="p16005701"  data-name="München"  data-zeile2="Isar"
//   data-wert="90" (water level)  data-wert2="20,90" (flow, m³/s)
//   data-ms="0" (Meldestufe, empty for a gauge without alert levels)
//   data-datum="24.10.2026, 01:00" (German local time)
//   data-graph="pgnr=…&art=w|s|q": w = level in cm, s = lake or reservoir
//   level in m above sea level, q = flow only (data-wert empty).
// The page has no coordinates (pixels of the map only).
// -----------------------------------------------------------------------------

import { getText } from '../http.js';
import { attributes, makeStation, parseGermanDate, point, toNumber } from './common.js';

export const CODE = 'BY';
export const PAGE_URL = 'https://www.hnd.bayern.de/pegel';

/** Every gauge of the page, with its current values. */
export function parse(html) {
  const stations = [];
  const anchors = /<a\s[^>]*href="([^"]*)"[^>]*>\s*(<img\s[^>]*>)/gi;
  for (const [, href, tag] of String(html).matchAll(anchors)) {
    const a = attributes(tag);
    const number = /^p(\d+)$/.exec(a.id ?? '')?.[1];
    if (!number || a['data-thema'] !== 'pegel' || !a['data-name']) {
      continue;
    }
    const kind = /[?&]?art=(\w)/.exec(a['data-graph'] ?? '')?.[1] ?? 'w';
    const t = parseGermanDate(a['data-datum']);
    const level = toNumber(a['data-wert']);
    const flow = toNumber(a['data-wert2']);
    const stage = a['data-ms'] === '' ? null : toNumber(a['data-ms']);
    const hasLevel = kind !== 'q' && level !== null;
    stations.push(
      makeStation(CODE, number, {
        name: a['data-name'].trim(),
        river: (a['data-zeile2'] ?? '').trim(),
        url: href.startsWith('http') ? href : new URL(href, PAGE_URL).href,
        unit: hasLevel ? (kind === 's' ? 'm' : 'cm') : null,
        flow: flow !== null,
        alerts: stage !== null,
        current: {
          W: hasLevel ? point(t, level) : null,
          Q: point(t, flow),
          stage: stage !== null && stage >= 0 && stage <= 4 ? stage : null,
        },
      }),
    );
  }
  return stations;
}

export const portal = {
  code: CODE,
  name: 'Bayern',
  site: 'https://www.hnd.bayern.de',
  // The page holds the readings of every gauge: one request per cycle.
  bulk: true,
  async list(fetchImpl) {
    return parse(await getText(fetchImpl, PAGE_URL, { accept: 'text/html' }));
  },
};
