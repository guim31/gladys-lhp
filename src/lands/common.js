// -----------------------------------------------------------------------------
// Helpers shared by the state portals (src/lands/*.js): numbers written the
// German way, local dates of Germany, alert levels from thresholds, and the
// plain station object every portal returns.
//
// A station, whatever its state:
//   { id: 'BY_16005701', land: 'BY', number: '16005701', name: 'München',
//     river: 'Isar', latitude, longitude, url, unit: 'cm' | 'm' | null,
//     flow: boolean, alerts: boolean, thresholds: [l1, l2, l3, l4] | null,
//     current: { W: { t, v } | null, Q: { t, v } | null, stage: 0..4 | null } }
// `id` is the identifier of the Home Assistant integration "hochwasserportal"
// (lhpapi): users moving from it keep their station list. `unit` is the unit of
// the water level (null: the gauge only measures the flow). `alerts`: the
// state rates this gauge with flood alert levels (Meldestufen).
// -----------------------------------------------------------------------------

export const TIME_ZONE = 'Europe/Berlin';

/** A finite number from a value or a German text ("20,90", "1.234,5"), else null. */
export function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  let text = String(value ?? '').trim();
  if (!/\d/.test(text)) {
    return null;
  }
  if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  }
  const number = Number(text);
  return text !== '' && Number.isFinite(number) ? number : null;
}

const berlinParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Offset of German time at an instant, in ms (1 or 2 hours). */
function berlinOffset(ms) {
  const parts = Object.fromEntries(
    berlinParts.formatToParts(new Date(ms)).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return asUtc - Math.floor(ms / 60000) * 60000;
}

/** The instant (ms) of a wall-clock time in Germany. */
export function germanTime(year, month, day, hour, minute) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle the offset, also next to a change of time.
  let ms = asUtc - berlinOffset(asUtc);
  ms = asUtc - berlinOffset(ms);
  return ms;
}

/**
 * "24.10.2026, 01:00", "24.10.2026 01:00 MESZ" or "24.10.2026 01:00 Uhr":
 * German local time, unless MEZ (UTC+1) or MESZ (UTC+2) says which.
 * @returns {number|null} ms
 */
export function parseGermanDate(text) {
  const match = /(\d{1,2})\.(\d{1,2})\.(\d{4})\D+(\d{1,2}):(\d{2})(?:\s*(MESZ|MEZ))?/.exec(
    String(text ?? ''),
  );
  if (!match) {
    return null;
  }
  const [, day, month, year, hour, minute, zone] = match.map((part, index) =>
    index > 0 && index < 6 ? Number(part) : part,
  );
  if (zone) {
    const offset = zone === 'MESZ' ? 2 : 1;
    return Date.UTC(year, month - 1, day, hour - offset, minute);
  }
  return germanTime(year, month, day, hour, minute);
}

/** An ISO date with its offset, in ms, or null. */
export function parseIsoDate(text) {
  const ms = Date.parse(String(text ?? ''));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The alert level (0 to 4) of a water level, from the thresholds of levels 1
 * to 4 (null when unknown): the highest level whose threshold is exceeded, as
 * lhpapi computes it. Null without a level or without any threshold.
 */
export function stageOf(level, thresholds) {
  if (level === null || level === undefined || !thresholds?.some((value) => value !== null)) {
    return null;
  }
  for (let index = 3; index >= 0; index -= 1) {
    if (
      thresholds[index] !== null &&
      thresholds[index] !== undefined &&
      level > thresholds[index]
    ) {
      return index + 1;
    }
  }
  return 0;
}

/** A positive threshold, else null (the portals write 0 for "none"). */
export const threshold = (value) => {
  const number = toNumber(value);
  return number !== null && number > 0 ? number : null;
};

/** A reading `{ t, v }`, or null when one of them is missing. */
export const point = (t, v) => (t !== null && v !== null ? { t, v } : null);

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

/** HTML entities decoded (named ones above, decimal and hexadecimal ones). */
export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === '#') {
      const value =
        code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) ? String.fromCodePoint(value) : entity;
    }
    return ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** Text without HTML tags and entities, spaces collapsed. */
export function stripTags(html) {
  return decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** The attributes of one HTML tag, decoded: { 'data-name': 'München', … }. */
export function attributes(tag) {
  const result = {};
  for (const [, name, value] of String(tag).matchAll(/([\w:-]+)="([^"]*)"/g)) {
    result[name.toLowerCase()] = decodeEntities(value);
  }
  return result;
}

/** A station object with every key, from the fields a portal knows. */
export function makeStation(land, number, fields) {
  return {
    id: `${land}_${number}`,
    land,
    number: String(number),
    name: fields.name,
    river: fields.river || null,
    latitude: fields.latitude ?? null,
    longitude: fields.longitude ?? null,
    url: fields.url ?? null,
    unit: fields.unit ?? null,
    flow: Boolean(fields.flow),
    alerts: Boolean(fields.alerts),
    thresholds: fields.thresholds ?? null,
    current: fields.current ?? null,
  };
}
