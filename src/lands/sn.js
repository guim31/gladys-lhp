// -----------------------------------------------------------------------------
// Sachsen: Landeshochwasserzentrum (LHWZ), LfULG.
//
// ONE page, …/hwims/portal/web/wasserstand-uebersicht, carries every gauge as
// a link <a href="wasserstand-pegel-501010" class="… meldePegel"> followed by
// its pop-up: status ("Kein Hochwasser", "Alarmstufe 2"…) coloured by the
// alert level, title "Schöna / Elbe", date (German local time), water level
// ("77 cm") and flow ("90,6 m³/s"). The "meldePegel" class marks the gauges
// rated with alert levels (Alarmstufen 1 to 4). No coordinates on the page.
// -----------------------------------------------------------------------------

import { getText } from '../http.js';
import { makeStation, parseGermanDate, point, stripTags, toNumber } from './common.js';

export const CODE = 'SN';
export const BASE_URL = 'https://www.umwelt.sachsen.de/umwelt/infosysteme/hwims/portal/web/';
export const PAGE_URL = `${BASE_URL}wasserstand-uebersicht`;

// Colours of the status, as lhpapi maps them (low water and normal are 0).
const STAGE_COLOURS = {
  '#b38758': 0,
  '#c5e566': 0,
  '#ffeb3b': 1,
  '#fb8a00': 2,
  '#e53835': 3,
  '#d400f9': 4,
};

/** The value of the row "<label>:" of a pop-up, as text. */
function row(block, label) {
  const match = new RegExp(
    `<span class="popUpLabel">\\s*${label}:\\s*</span>\\s*<span class="popUpValue">([\\s\\S]*?)</span>\\s*</div>`,
  ).exec(block);
  return match ? stripTags(match[1]) : null;
}

/** The alert level of a pop-up status, or null. */
function stageOfStatus(block) {
  const status = /<div class="popUpStatus"([^>]*)>\s*<div>([^<]*)<\/div>/.exec(block);
  if (!status) {
    return null;
  }
  const level = /Alarmstufe\s*([1-4])/i.exec(status[2]);
  if (level) {
    return Number(level[1]);
  }
  const colour = /background-color:\s*(#[0-9a-f]{6})/i.exec(status[1])?.[1];
  return STAGE_COLOURS[colour?.toLowerCase()] ?? null;
}

/** Every gauge of the page, with its current values. */
export function parse(html) {
  const text = String(html);
  const links = [...text.matchAll(/<a href="wasserstand-pegel-(\d+)"[^>]*class="([^"]*)"[^>]*>/g)];
  const stations = [];
  links.forEach((link, index) => {
    const number = link[1];
    const end = index + 1 < links.length ? links[index + 1].index : text.length;
    const block = text.slice(link.index, end);
    const title = /<span class="popUpTitleBold">([^<]*)<\/span>/.exec(block);
    if (!title) {
      return;
    }
    const [name, ...river] = stripTags(title[1]).split(' / ');
    const t = parseGermanDate(row(block, 'Datum'));
    const levelText = row(block, 'Wasserstand');
    const flowText = row(block, 'Durchfluss');
    const level = toNumber(levelText?.split(' ')[0], { german: true });
    const flow = toNumber(flowText?.split(' ')[0], { german: true });
    const alerts = /\bmeldePegel\b/.test(link[2]);
    const unit = levelText === null ? null : /\bcm\b/.test(levelText) ? 'cm' : 'm';
    stations.push(
      makeStation(CODE, number, {
        name: name.trim(),
        river: river.join(' / ').trim(),
        url: `${BASE_URL}wasserstand-pegel-${number}`,
        unit,
        flow: flowText !== null,
        alerts,
        current: {
          W: point(t, level),
          Q: point(t, flow),
          stage: alerts && level !== null ? stageOfStatus(block) : null,
        },
      }),
    );
  });
  return stations;
}

export const portal = {
  code: CODE,
  name: 'Sachsen',
  site: 'https://www.umwelt.sachsen.de/umwelt/infosysteme/hwims/portal/web/',
  bulk: true,
  async list(fetchImpl) {
    return parse(await getText(fetchImpl, PAGE_URL, { accept: 'text/html' }));
  },
};
