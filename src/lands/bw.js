// -----------------------------------------------------------------------------
// Baden-Württemberg: Hochwasservorhersagezentrale (HVZ), LUBW.
//
// ONE script, https://www.hvz.baden-wuerttemberg.de/js/hvz_peg_stmn.js, holds
// every gauge as a row of a JavaScript array (HVZ_Site.PEG_DB), with its
// current values. Columns used (as lhpapi reads them):
//    0 number          1 name           2 river
//    4 water level     5 its unit ('cm'; 'm', 'müM', 'müNN' for lakes; '')
//    6 its date ("24.10.2026 01:00 MESZ")
//    7 flow            8 its unit ('m³/s' or '')    9 its date
//   20 longitude      21 latitude
//   24 "HMO" level in m, 30 to 33 thresholds of the alert levels 1 to 4 in cm
//      (0 = none). The lower of HMO and the level 1 threshold opens level 1.
// -----------------------------------------------------------------------------

import { getText } from '../http.js';
import { makeStation, parseGermanDate, point, stageOf, threshold, toNumber } from './common.js';

export const CODE = 'BW';
export const SCRIPT_URL = 'https://www.hvz.baden-wuerttemberg.de/js/hvz_peg_stmn.js';
export const stationPage = (number) =>
  `https://www.hvz.baden-wuerttemberg.de/pegel.html?id=${encodeURIComponent(number)}`;

const TOKEN = /'((?:[^'\\]|\\.)*)'|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi;

/** The values of one row "['00001','Eberfingen',…,0]" (strings and numbers). */
export function parseRow(line) {
  const values = [];
  for (const [, text, number] of line.matchAll(TOKEN)) {
    values.push(text !== undefined ? text.replace(/\\(.)/g, '$1') : Number(number));
  }
  return values;
}

/** The thresholds of the alert levels 1 to 4 (cm), or null without any. */
export function thresholdsOf(row) {
  const levels = [30, 31, 32, 33].map((index) => threshold(row[index]));
  const hmo = threshold(row[24]);
  if (hmo !== null) {
    const hmoCm = Math.round(hmo * 100);
    levels[0] = levels[0] === null ? hmoCm : Math.min(levels[0], hmoCm);
  }
  return levels.some((value) => value !== null) ? levels : null;
}

/** Every gauge of the script, with its current values. */
export function parse(script) {
  const stations = [];
  for (const line of String(script).split(/\r?\n/)) {
    if (!/^\s*\['/.test(line)) {
      continue;
    }
    const row = parseRow(line);
    if (row.length < 34 || !/^\d+$/.test(String(row[0])) || !row[1]) {
      continue;
    }
    const rawUnit = String(row[5]);
    const unit = rawUnit === 'cm' ? 'cm' : /^m/.test(rawUnit) ? 'm' : null;
    const level = unit ? toNumber(row[4]) : null;
    const flow = row[8] === 'm³/s' ? toNumber(row[7]) : null;
    const thresholds = unit === 'cm' ? thresholdsOf(row) : null;
    stations.push(
      makeStation(CODE, row[0], {
        name: String(row[1]).trim(),
        river: String(row[2]).trim(),
        latitude: toNumber(row[21]),
        longitude: toNumber(row[20]),
        url: stationPage(row[0]),
        unit,
        flow: row[8] === 'm³/s',
        alerts: thresholds !== null,
        thresholds,
        current: {
          W: unit ? point(parseGermanDate(row[6]), level) : null,
          Q: point(parseGermanDate(row[9]), flow),
          stage: thresholds ? stageOf(level, thresholds) : null,
        },
      }),
    );
  }
  return stations;
}

export const portal = {
  code: CODE,
  name: 'Baden-Württemberg',
  site: 'https://www.hvz.baden-wuerttemberg.de',
  bulk: true,
  async list(fetchImpl) {
    return parse(await getText(fetchImpl, SCRIPT_URL));
  },
};
