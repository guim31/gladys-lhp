// -----------------------------------------------------------------------------
// Texts sent from the container (feature values, connection status, action
// messages, scene variables), in the four languages of the Gladys interface.
// Entries are strings or functions of one parameter object. German says "du",
// Spanish "usted".
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

// Names of the flood alert levels 0 to 4, as the LHP map words them (the states
// call them Meldestufe, Alarmstufe or Informationsstufe).
export const LEVEL_NAMES = {
  en: [
    'no flood',
    'level 1 (minor flood)',
    'level 2 (moderate flood)',
    'level 3 (major flood)',
    'level 4 (very major flood)',
  ],
  fr: [
    'pas de crue',
    'niveau 1 (petite crue)',
    'niveau 2 (crue moyenne)',
    'niveau 3 (forte crue)',
    'niveau 4 (très forte crue)',
  ],
  de: [
    'kein Hochwasser',
    'Stufe 1 (kleines Hochwasser)',
    'Stufe 2 (mittleres Hochwasser)',
    'Stufe 3 (großes Hochwasser)',
    'Stufe 4 (sehr großes Hochwasser)',
  ],
  es: [
    'sin crecida',
    'nivel 1 (crecida menor)',
    'nivel 2 (crecida moderada)',
    'nivel 3 (crecida grave)',
    'nivel 4 (crecida muy grave)',
  ],
};

export const TREND_NAMES = {
  en: { rising: 'rising', steady: 'steady', falling: 'falling', unknown: 'unknown' },
  fr: { rising: 'monte', steady: 'stable', falling: 'baisse', unknown: 'inconnue' },
  de: { rising: 'steigt', steady: 'gleichbleibend', falling: 'fällt', unknown: 'unbekannt' },
  es: { rising: 'sube', steady: 'estable', falling: 'baja', unknown: 'desconocida' },
};

// Values of the "Last reading" feature.
export const READINGS = {
  en: { staleSince: ({ date }) => `No new reading since ${date}` },
  fr: { staleSince: ({ date }) => `Pas de nouvelle mesure depuis le ${date}` },
  de: { staleSince: ({ date }) => `Keine neue Messung seit ${date}` },
  es: { staleSince: ({ date }) => `Sin nueva medición desde el ${date}` },
};

// Connection status of the Configuration screen.
export const STATUS = {
  en: {
    initFailed: 'Initialization failed, check the integration logs.',
    down: ({ names }) =>
      `No answer from the portal of ${names}: the readings will come back with it.`,
    unknown: ({ names }) => `Unknown station: ${names}. Use "Find stations".`,
    homeFailed:
      'Around my house: the nearest stations cannot be chosen yet, tried again at the next refresh.',
    noHouse: 'Around my house: give your house a location in Gladys (Settings, Houses).',
    tooMany: ({ max }) => `Only the first ${max} stations are followed.`,
    none: 'No station yet: fill in the configuration, or use "Find stations".',
  },
  fr: {
    initFailed: "L'initialisation a échoué, consultez les logs de l'intégration.",
    down: ({ names }) => `Le portail de ${names} ne répond pas : les mesures reviendront avec lui.`,
    unknown: ({ names }) => `Station inconnue : ${names}. Utilisez « Chercher des stations ».`,
    homeFailed:
      'Autour de ma maison : les stations les plus proches ne peuvent pas encore être choisies, nouvel essai à la prochaine mise à jour.',
    noHouse:
      'Autour de ma maison : indiquez la position de votre maison dans Gladys (Paramètres, Maisons).',
    tooMany: ({ max }) => `Seules les ${max} premières stations sont suivies.`,
    none: 'Aucune station : remplissez la configuration, ou utilisez « Chercher des stations ».',
  },
  de: {
    initFailed: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    down: ({ names }) =>
      `Das Portal von ${names} antwortet nicht: Die Messwerte kommen mit ihm zurück.`,
    unknown: ({ names }) => `Unbekannte Station: ${names}. Nutze „Stationen suchen“.`,
    homeFailed:
      'Rund um mein Haus: Die nächsten Stationen können noch nicht gewählt werden, neuer Versuch bei der nächsten Aktualisierung.',
    noHouse: 'Rund um mein Haus: Gib deinem Haus in Gladys einen Standort (Einstellungen, Häuser).',
    tooMany: ({ max }) => `Nur die ersten ${max} Stationen werden verfolgt.`,
    none: 'Noch keine Station: Fülle die Konfiguration aus oder nutze „Stationen suchen“.',
  },
  es: {
    initFailed: 'La inicialización ha fallado, consulte los registros de la integración.',
    down: ({ names }) => `El portal de ${names} no responde: las mediciones volverán con él.`,
    unknown: ({ names }) => `Estación desconocida: ${names}. Use «Buscar estaciones».`,
    homeFailed:
      'Alrededor de mi casa: aún no se pueden elegir las estaciones más cercanas, nuevo intento en la próxima actualización.',
    noHouse: 'Alrededor de mi casa: indique la ubicación de su casa en Gladys (Ajustes, Casas).',
    tooMany: ({ max }) => `Solo se siguen las ${max} primeras estaciones.`,
    none: 'Aún no hay estaciones: rellene la configuración o use «Buscar estaciones».',
  },
};

// Messages of the "Find stations" action.
export const SEARCH = {
  en: {
    noHouse:
      'Your house has no location in Gladys: type a station name, a river (Isar, Neckar…), a station id (BY_16005701) or a gauge number.',
    none: 'No station found.',
    found: ({ count, total }) =>
      `${total > count ? `${count} of ${total}` : count} station(s). Copy the ids into "Stations", then save:`,
    unavailable: 'The flood portals do not answer, try again in a few minutes.',
    noRecent: 'no recent reading',
  },
  fr: {
    noHouse:
      "Votre maison n'a pas de position dans Gladys : tapez un nom de station, un cours d'eau (Isar, Neckar…), un identifiant (BY_16005701) ou un numéro de station.",
    none: 'Aucune station trouvée.',
    found: ({ count, total }) =>
      `${total > count ? `${count} sur ${total}` : count} station(s). Copiez les identifiants dans « Stations », puis enregistrez :`,
    unavailable: 'Les portails de crues ne répondent pas, réessayez dans quelques minutes.',
    noRecent: 'pas de mesure récente',
  },
  de: {
    noHouse:
      'Dein Haus hat in Gladys keinen Standort: Gib einen Stationsnamen, ein Gewässer (Isar, Neckar…), eine Stations-ID (BY_16005701) oder eine Pegelnummer ein.',
    none: 'Keine Station gefunden.',
    found: ({ count, total }) =>
      `${total > count ? `${count} von ${total}` : count} Station(en). Kopiere die IDs in „Stationen“ und speichere:`,
    unavailable: 'Die Hochwasserportale antworten nicht, versuche es in ein paar Minuten erneut.',
    noRecent: 'keine aktuelle Messung',
  },
  es: {
    noHouse:
      'Su casa no tiene ubicación en Gladys: escriba el nombre de una estación, un río (Isar, Neckar…), un identificador (BY_16005701) o un número de estación.',
    none: 'No se ha encontrado ninguna estación.',
    found: ({ count, total }) =>
      `${total > count ? `${count} de ${total}` : count} estación(es). Copie los identificadores en «Estaciones» y guarde:`,
    unavailable: 'Los portales de crecidas no responden, inténtelo de nuevo en unos minutos.',
    noRecent: 'sin medición reciente',
  },
};

/** One entry of a message table, in every language: `{ en, fr, de, es }`. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const entry = table[language][key];
      return [language, typeof entry === 'function' ? entry(params) : entry];
    }),
  );
}

/** Several multi-language texts joined, language by language. */
export function join(...messages) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      messages
        .filter(Boolean)
        .map((message) => message[language])
        .join(' '),
    ]),
  );
}

/** A date in the user's time zone (TZ, set by the Gladys supervisor), e.g. "13/10 18:35". */
export function formatDate(time, language) {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : language, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

/** A number in the user's language, e.g. "2,59" in French. */
export function formatNumber(value, language, digits = 2) {
  return new Intl.NumberFormat(language === 'en' ? 'en-GB' : language, {
    maximumFractionDigits: digits,
  }).format(value);
}

/** A water level with its unit, e.g. "387 cm" or "56,51 m". */
export function formatHeight(value, unit, language) {
  return unit === 'cm'
    ? `${formatNumber(value, language, 0)} cm`
    : `${formatNumber(value, language)} m`;
}
