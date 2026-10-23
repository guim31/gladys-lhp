// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `stations`.
//
// Without setting, one status line per followed station (10 at most): the
// water level and its trend, coloured by its flood alert level (closed palette
// of the widgets: 0 success, 1 and 2 warning, 3 and 4 danger; neutral without
// alert levels or without a recent reading). A heading names the stations on
// alert.
//
// With a station chosen in the settings: its live water level and flow tiles
// (bound to the device features), then its alert level, trend and last
// reading.
//
// Both end with the source and its date and a link to the portal.
// Budget: 2 texts, 1 status, 2 tiles, 1 button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { stationIdOfId, stationIds } from './devices.js';
import { LHP_URL, PORTALS } from './lhp.js';
import { LEVEL_NAMES, TREND_NAMES, formatDate, formatHeight } from './messages.js';
import { WIDGET_KEY } from './monitor.js';

export const MAX_STATUS_ITEMS = 10;
export const TTL_SECONDS = 300;
const MAX_STATUS_TEXT = 40;

export const TEXT = {
  empty: {
    en: 'No station yet: fill in the configuration of the Hochwasserportal integration, then create the devices in the Discover tab.',
    fr: "Aucune station pour l'instant : remplissez la configuration de l'intégration Hochwasserportal, puis créez les appareils dans l'onglet Découverte.",
    de: 'Noch keine Station: Fülle die Konfiguration der Integration Hochwasserportal aus und lege dann die Geräte im Tab „Entdecken“ an.',
    es: 'Aún no hay estaciones: rellene la configuración de la integración Hochwasserportal y, después, cree los dispositivos en la pestaña Descubrir.',
  },
  gone: {
    en: 'This station is no longer followed.',
    fr: "Cette station n'est plus suivie.",
    de: 'Diese Station wird nicht mehr verfolgt.',
    es: 'Esta estación ya no se sigue.',
  },
  alert: {
    en: 'Flood alert: ',
    fr: 'Alerte crue : ',
    de: 'Hochwasserwarnung: ',
    es: 'Alerta de crecida: ',
  },
  height: { en: 'Water level', fr: "Hauteur d'eau", de: 'Wasserstand', es: 'Nivel del agua' },
  flow: { en: 'Flow', fr: 'Débit', de: 'Abfluss', es: 'Caudal' },
  level: { en: 'Alert level', fr: "Niveau d'alerte", de: 'Meldestufe', es: 'Nivel de alerta' },
  trend: { en: 'Trend', fr: 'Tendance', de: 'Tendenz', es: 'Tendencia' },
  lastReading: {
    en: 'Last reading',
    fr: 'Dernière mesure',
    de: 'Letzte Messung',
    es: 'Última medición',
  },
  silent: {
    en: 'Silent since ',
    fr: 'Muette depuis le ',
    de: 'Still seit ',
    es: 'Sin datos desde ',
  },
  waiting: { en: 'Waiting', fr: 'En attente', de: 'Wartet', es: 'En espera' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  source: { en: 'Source: ', fr: 'Source : ', de: 'Quelle: ', es: 'Fuente: ' },
  sources: {
    en: 'flood portals of the states',
    fr: 'portails de crues des Länder',
    de: 'Hochwasserportale der Länder',
    es: 'portales de los Länder',
  },
  site: { en: 'Portal', fr: 'Portail', de: 'Portal', es: 'Portal' },
};

const t = (text, language) => text[language] ?? text.en;
const clip = (text, max = MAX_STATUS_TEXT) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

const TREND_ICONS = { rising: 'trending-up', falling: 'trending-down', steady: 'minus' };
const LEVEL_COLORS = [
  WIDGET_COLORS.SUCCESS,
  WIDGET_COLORS.WARNING,
  WIDGET_COLORS.WARNING,
  WIDGET_COLORS.DANGER,
  WIDGET_COLORS.DANGER,
];

/** Colour of a station line: its alert level, when the reading is recent. */
const colorOf = (view) =>
  view.level === null ? WIDGET_COLORS.NEUTRAL : (LEVEL_COLORS[view.level] ?? WIDGET_COLORS.NEUTRAL);

/** The status value of a station, e.g. "387 cm, steigt" (40 characters at most). */
export function stationValue(view, language) {
  if (view.lastReadingAt === null) {
    return t(TEXT.waiting, language);
  }
  if (view.height === null) {
    return clip(`${t(TEXT.silent, language)}${formatDate(view.lastReadingAt, language)}`);
  }
  const height = formatHeight(view.height, view.unit, language);
  return clip(view.trend ? `${height}, ${TREND_NAMES[language][view.trend]}` : height);
}

function footer(monitor, ids, language, link, sourceName) {
  const updated = monitor.updatedAt(ids);
  const source = `${t(TEXT.source, language)}${sourceName ?? t(TEXT.sources, language)}`;
  return [
    {
      type: 'text',
      variant: 'caption',
      text: updated === null ? source : `${source} · ${formatDate(updated, language)}`,
    },
    { type: 'button', label: t(TEXT.site, language), icon: 'external-link', link: { url: link } },
  ];
}

function overview(monitor, ids, language) {
  const views = ids.slice(0, MAX_STATUS_ITEMS).map((id) => monitor.view(id));
  const components = [];
  const alerting = views.filter((view) => view.level !== null && view.level > 0);
  if (alerting.length > 0) {
    components.push({
      type: 'text',
      variant: 'heading',
      text: clip(`${t(TEXT.alert, language)}${alerting.map((view) => view.name).join(', ')}`, 100),
    });
  }
  components.push({
    type: 'status',
    items: views.map((view) => ({
      label: clip(view.name),
      value: stationValue(view, language),
      color: colorOf(view),
      icon: view.trend ? TREND_ICONS[view.trend] : 'clock',
    })),
  });
  return [...components, ...footer(monitor, ids, language, LHP_URL)];
}

function detail(monitor, id, language) {
  const view = monitor.view(id);
  const station = monitor.station(id);
  const ids = stationIds(monitor.gladys, id);
  const components = [];
  if (view.has.height) {
    components.push({ type: 'value', label: t(TEXT.height, language), device_feature: ids.height });
  }
  if (view.has.flow) {
    components.push({ type: 'value', label: t(TEXT.flow, language), device_feature: ids.flow });
  }
  const items = [];
  if (view.has.alert_level) {
    items.push({
      label: t(TEXT.level, language),
      value:
        view.level === null ? t(TEXT.unknown, language) : clip(LEVEL_NAMES[language][view.level]),
      color: colorOf(view),
      icon: 'alert-circle',
    });
  }
  if (view.has.height) {
    items.push({
      label: t(TEXT.trend, language),
      value: view.trend ? TREND_NAMES[language][view.trend] : t(TEXT.unknown, language),
      icon: view.trend ? TREND_ICONS[view.trend] : 'minus',
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  items.push({
    label: t(TEXT.lastReading, language),
    value:
      view.lastReadingAt === null
        ? t(TEXT.waiting, language)
        : formatDate(view.lastReadingAt, language),
    color: view.fresh ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
    icon: 'clock',
  });
  components.push({ type: 'status', items });
  const portal = PORTALS[view.land];
  const link = station?.url ?? portal?.site ?? LHP_URL;
  return [...components, ...footer(monitor, [id], language, link, portal?.name)];
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(monitor, { settings, language = 'en' }) {
      const lang = LEVEL_NAMES[language] ? language : 'en';
      const created = monitor.created();
      const chosen = typeof settings?.station === 'string' ? settings.station : null;
      if (chosen) {
        const id = stationIdOfId(monitor.gladys, chosen);
        const components =
          id && created.includes(id)
            ? detail(monitor, id, lang)
            : [{ type: 'text', variant: 'body', text: t(TEXT.gone, lang) }];
        return { ttl_seconds: TTL_SECONDS, components };
      }
      if (created.length === 0) {
        return {
          ttl_seconds: TTL_SECONDS,
          components: [{ type: 'text', variant: 'body', text: t(TEXT.empty, lang) }],
        };
      }
      return { ttl_seconds: TTL_SECONDS, components: overview(monitor, created, lang) };
    },
  },
};
