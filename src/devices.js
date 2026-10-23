// -----------------------------------------------------------------------------
// One Gladys device per gauge of a state flood portal.
//
// Features (couples checked against the Gladys front, v5.2, see
// test/gladys-rules.test.js), each only when the gauge has it:
//   - height        level-sensor/liquid-depth: the water level, in cm above
//                   the gauge zero as the state portal shows it (in m for the
//                   lake and reservoir gauges given in m above sea level);
//   - flow          water-valve/flow, in m³/s. Gladys has no m³/s unit (only
//                   m³/h): no unit, the name says it, the value reads like on
//                   the portal;
//   - alert_level   risk/integer, 0 to 4: the flood alert level (Meldestufe,
//                   Alarmstufe, Informationsstufe) of the state, for the
//                   gauges the state rates;
//   - trend         text/text: rising, steady or falling, from the last hour;
//   - last_reading  text/text: the date of the last measurement, or "no new
//                   reading since…" once the gauge is silent.
//
// Published with should_poll: false: the refresh runs in the container
// (src/monitor.js). The platform id is the station id "<state>_<number>"
// (BY_16005701), the one of the Home Assistant integration "hochwasserportal".
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'station';
export const FEATURE_KEYS = {
  HEIGHT: 'height',
  FLOW: 'flow',
  ALERT_LEVEL: 'alert_level',
  TREND: 'trend',
  LAST_READING: 'last_reading',
};

// Display bounds (history chart, gauge). Levels above sea level stay under
// 3000 m; the highest German flood marks are about 15 m (in cm).
export const HEIGHT_BOUNDS = { cm: [-1000, 6000], m: [-100, 3000] };
export const FLOW_BOUND_M3S = 50000;
export const MAX_ALERT_LEVEL = 4;

// Feature names, frozen at creation in Gladys (language of the configuration).
export const NAMES = {
  en: {
    height: 'Water level',
    flow: 'Flow (m³/s)',
    alert_level: 'Flood alert level (0 to 4)',
    trend: 'Trend',
    last_reading: 'Last reading',
  },
  fr: {
    height: "Hauteur d'eau",
    flow: 'Débit (m³/s)',
    alert_level: "Niveau d'alerte crue (0 à 4)",
    trend: 'Tendance',
    last_reading: 'Dernière mesure',
  },
  de: {
    height: 'Wasserstand',
    flow: 'Abfluss (m³/s)',
    alert_level: 'Hochwasser-Meldestufe (0 bis 4)',
    trend: 'Tendenz',
    last_reading: 'Letzte Messung',
  },
  es: {
    height: 'Nivel del agua',
    flow: 'Caudal (m³/s)',
    alert_level: 'Nivel de alerta de crecida (0 a 4)',
    trend: 'Tendencia',
    last_reading: 'Última medición',
  },
};

/** External ids of a station device and of its features. */
export function stationIds(gladys, id) {
  const ids = gladys.externalIds(DEVICE_TYPE, id);
  return {
    device: ids.device,
    ...Object.fromEntries(Object.values(FEATURE_KEYS).map((key) => [key, ids.feature(key)])),
  };
}

/** The station id of a device or feature external id (null if not ours). */
export function stationIdOfId(gladys, externalId) {
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  return externalId.slice(prefix.length).split(':')[0] || null;
}

/**
 * What a station offers: which features, and the unit of its water level. A
 * station rebuilt from a Gladys device carries `has`, read from its features.
 */
export function capabilities(station) {
  if (station.has) {
    return station.has;
  }
  const height = station.unit === 'cm' || station.unit === 'm';
  return {
    height,
    heightUnit: height ? station.unit : null,
    flow: Boolean(station.flow),
    alert_level: Boolean(station.alerts),
  };
}

/** "München / Isar", as the state portals and the LHP write it. */
export const displayName = (station) =>
  station.river ? `${station.name} / ${station.river}` : station.name;

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

/**
 * The discovery payload of a station.
 * @param {object} gladys
 * @param {object} station see src/lands/common.js
 * @param {string} language language of the feature names
 * @param {string} [landName] name of the state, for the model
 */
export function buildDevice(gladys, station, language = 'fr', landName = station.land) {
  const ids = stationIds(gladys, station.id);
  const names = NAMES[language] ?? NAMES.fr;
  const has = capabilities(station);
  const C = DEVICE_FEATURE_CATEGORIES;
  const features = [];
  if (has.height) {
    const unit = has.heightUnit === 'cm' ? 'cm' : 'm';
    const [min, max] = HEIGHT_BOUNDS[unit];
    features.push(
      sensor(names.height, ids.height, C.LEVEL_SENSOR, TYPES.LEVEL_SENSOR.LIQUID_DEPTH, {
        unit: unit === 'cm' ? DEVICE_FEATURE_UNITS.CM : DEVICE_FEATURE_UNITS.M,
        keep_history: true,
        min,
        max,
      }),
    );
  }
  if (has.flow) {
    features.push(
      sensor(names.flow, ids.flow, C.WATER_VALVE, TYPES.WATER_VALVE.FLOW, {
        keep_history: true,
        min: 0,
        max: FLOW_BOUND_M3S,
      }),
    );
  }
  if (has.alert_level) {
    features.push(
      sensor(names.alert_level, ids.alert_level, C.RISK, TYPES.RISK.INTEGER, {
        keep_history: true,
        min: 0,
        max: MAX_ALERT_LEVEL,
      }),
    );
  }
  if (has.height) {
    features.push(
      sensor(names.trend, ids.trend, C.TEXT, TYPES.TEXT.TEXT, {
        keep_history: false,
        min: 0,
        max: 0,
      }),
    );
  }
  features.push(
    sensor(names.last_reading, ids.last_reading, C.TEXT, TYPES.TEXT.TEXT, {
      keep_history: false,
      min: 0,
      max: 0,
    }),
  );
  const params = [
    { name: 'STATION_ID', value: station.id },
    { name: 'STATION_NAME', value: station.name },
    { name: 'STATE', value: station.land },
  ];
  if (station.river) {
    params.push({ name: 'RIVER', value: station.river });
  }
  if (station.url) {
    params.push({ name: 'URL', value: station.url });
  }
  return {
    name: displayName(station),
    external_id: ids.device,
    model: `Hochwasserportal · ${landName}`,
    should_poll: false,
    params,
    features,
  };
}
