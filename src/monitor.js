// -----------------------------------------------------------------------------
// The monitor: which gauges are followed, their readings, the states published
// to Gladys and the scene triggers. Everything the SDK handlers, the action and
// the widget need goes through it (src/app.js wires it).
//
// Followed stations: the "Stations" field and "around my house" of the
// configuration (MAX_STATIONS at most), plus every station whose device the
// user created (deleting the device stops following it).
//
// Scheduling: the devices are published with should_poll: false (the core does
// not poll external devices reliably, GladysAssistant/Gladys#3198). The monitor
// runs a cycle at the configured interval: one request per "bulk" state, one
// per station elsewhere (src/lhp.js). The station lists, needed to resolve
// names and numbers and to find the gauges around the house, are downloaded
// only when needed and kept a week in memory.
//
// States: `publishChangedStates` sends only what changed, plus a heartbeat every
// 12 hours. A reading older than 6 hours is never sent again as if it were
// fresh: the values stop, the "Last reading" feature says since when.
//
// Logs: at info, only the lifecycle (start, stations followed, a gauge going
// silent or coming back, an alert level change). A failure that repeats at
// every cycle is logged once, then at debug until it recovers, with one line
// at recovery. LOG_LEVEL=debug shows every cycle. The coordinates of the house
// are never logged nor sent: the gauges around it are chosen locally.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { HOME_STATIONS, MAX_STATIONS, normalizeName } from './config.js';
import { buildDevice, capabilities, displayName, stationIdOfId, stationIds } from './devices.js';
import { distanceKm } from './geo.js';
import { Lhp, PORTALS, STATION_ID } from './lhp.js';
import {
  LEVEL_NAMES,
  READINGS,
  STATUS,
  TREND_NAMES,
  formatDate,
  join,
  render,
} from './messages.js';

const logger = createLogger({ name: 'lhp' });

export const WIDGET_KEY = 'stations';
export const TRIGGERS = {
  ALERT_RAISED: 'alert_raised',
  ALERT_LOWERED: 'alert_lowered',
  READINGS_STOPPED: 'readings_stopped',
  READINGS_RESUMED: 'readings_resumed',
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEFAULT_TIMINGS = {
  // Without a newer reading, a value is not published again as a fresh one.
  // Some gauges deliver their values in batches, a few hours late.
  staleAfterMs: 6 * HOUR,
  // The station lists (names, numbers, thresholds) are downloaded again after a week.
  referentialMaxAgeMs: 7 * DAY,
  // The stations around the house are chosen again once a day.
  homeMaxAgeMs: DAY,
  // A state remembered for longer fires no trigger when it changes (restart).
  memoryMs: DAY,
  // Heights kept for the trend.
  historyMs: 3 * HOUR,
  heartbeatMs: 12 * HOUR,
  // requestWidgetRefresh is rate-limited to one call every 10 s by the core.
  widgetRefreshMs: 10000,
};

// Below this rise per hour, a level is steady: 1 cm (0.01 m).
const STEADY_PER_HOUR = { cm: 1, m: 0.01 };
// Gauges asked for a fresh reading when choosing those around the house.
const HOME_CANDIDATES = 10;

/**
 * Rising, steady or falling, from heights newest first (`{ t, v }`); null when
 * there is no height 45 minutes to 2 hours older than the newest.
 */
export function trendOf(heights, unit = 'cm') {
  const [latest] = heights;
  if (!latest) {
    return null;
  }
  const earlier = heights.find((point) => latest.t - point.t >= 45 * MINUTE);
  if (!earlier || latest.t - earlier.t > 2 * HOUR) {
    return null;
  }
  const perHour = (latest.v - earlier.v) / ((latest.t - earlier.t) / HOUR);
  const steady = STEADY_PER_HOUR[unit] ?? STEADY_PER_HOUR.m;
  if (perHour >= steady) {
    return 'rising';
  }
  return perHour <= -steady ? 'falling' : 'steady';
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** The station a bare id stands for, until the portal of its state says more. */
const placeholder = (id) => {
  const [, land, number] = STATION_ID.exec(id) ?? [];
  return { id, land: land ?? null, number: number ?? id, name: id, rebuilt: true };
};

export class Monitor {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK fake)
   * @param {object} options.store see src/store.js
   * @param {Function} [options.fetch] fetch, for the portals
   * @param {boolean} [options.timers] false: no background timer (tests drive the cycles)
   * @param {Function} [options.now] clock in ms
   * @param {object} [options.timings] overrides of DEFAULT_TIMINGS
   */
  constructor({ gladys, store, fetch: fetchImpl, timers = true, now, timings }) {
    this.gladys = gladys;
    this.store = store;
    this.now = now ?? (() => Date.now());
    this.api = new Lhp({ fetch: fetchImpl, now: this.now });
    this.timers = timers;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.config = null;
    this.data = emptyData();
    // Stations of the configuration, in order (field, then house).
    this.configured = [];
    this.problems = { unknown: [], noHouse: false, tooMany: false };
    this.resolved = false;
    // States whose portal failed at the last cycle.
    this.down = [];
    this.lastCycleAt = -Infinity;
    this.statusMessage = undefined;
    this.cycleTimer = null;
    this.running = null;
    this.lastRefreshAt = -Infinity;
    this.refreshTimer = null;
    this.rerun = null;
    this.stopped = false;
    // Keys of the failures already logged, so a repeated one is not logged again.
    this.failing = new Set();
  }

  /** Log a failure once (warn or error), then at debug until `recovered(key)`. */
  failed(key, level, message, err) {
    const details = err ? [message, err] : [message];
    if (this.failing.has(key)) {
      logger.debug(...details);
      return;
    }
    this.failing.add(key);
    logger[level](...details);
  }

  /** One line when a failure logged by `failed(key)` is over. */
  recovered(key, message) {
    if (this.failing.delete(key)) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    if (saved?.version === 1) {
      this.data = { ...emptyData(), ...saved };
    }
    // Scheduled first: a failure below must not leave the integration without cycles.
    this.schedule();
    await this.runCycle();
    await this.publishDiscovered();
    logger.info(
      `Started: ${this.followed().length} station(s) followed, refreshed every ${config.refreshMinutes} min`,
    );
  }

  /** Reconnection: Gladys may have restarted, publish everything again. */
  async resync(config) {
    this.config = config;
    if (!this.cycleTimer) {
      this.schedule();
    }
    await this.publishDiscovered();
    this.statusMessage = undefined;
    await this.updateConnectionStatus();
    this.gladys.forgetPublishedStates?.();
    await this.publishStates(this.created());
    this.requestRefresh();
  }

  async reconfigure(config) {
    const before = this.followed().join(',');
    this.config = config;
    this.data.home = null;
    this.resolved = false;
    // A cycle already running reads the old configuration: run another one after it.
    await this.runCycle({ again: true });
    await this.publishDiscovered();
    const after = this.followed();
    if (after.join(',') !== before) {
      logger.info(`Configuration saved: ${after.length} station(s) followed`);
    }
    this.schedule();
    this.requestRefresh();
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.cycleTimer);
    clearTimeout(this.refreshTimer);
    this.cycleTimer = null;
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    if (!this.timers || this.stopped) {
      return;
    }
    clearInterval(this.cycleTimer);
    this.cycleTimer = setInterval(() => this.runCycle(), this.config.refreshMinutes * MINUTE);
    this.cycleTimer.unref?.();
  }

  save() {
    return this.store.save(this.data);
  }

  // --- Which stations ----------------------------------------------------------

  /** Station ids whose device exists in Gladys. */
  created() {
    return [
      ...new Set(
        (this.gladys.devices ?? [])
          .map((device) => stationIdOfId(this.gladys, device.external_id))
          .filter(Boolean),
      ),
    ];
  }

  isCreated(id) {
    const externalId = stationIds(this.gladys, id).device;
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  /** Every followed station: the configured ones, then the created ones. */
  followed() {
    return [...new Set([...this.configured, ...this.created()])];
  }

  /** What the integration knows of a station, a created device filling the gaps. */
  station(id) {
    const known = this.data.stations[id];
    if (known) {
      return known;
    }
    const device = (this.gladys.devices ?? []).find(
      (item) => stationIdOfId(this.gladys, item.external_id) === id,
    );
    if (!device) {
      return null;
    }
    const param = (name) => device.params?.find((p) => p.name === name)?.value;
    const features = new Map(
      (device.features ?? []).map((f) => [f.external_id.split(':').pop(), f]),
    );
    const [, land, number] = STATION_ID.exec(id) ?? [];
    return {
      id,
      land: land ?? null,
      number: number ?? id,
      name: param('STATION_NAME') ?? device.name ?? id,
      river: param('RIVER') ?? null,
      url: param('URL') ?? null,
      has: {
        height: features.has('height'),
        heightUnit: features.get('height')?.unit === 'cm' ? 'cm' : 'm',
        flow: features.has('flow'),
        alert_level: features.has('alert_level'),
      },
    };
  }

  /** Every station of the supported states; null when no state answers. */
  async stationList() {
    const { stations, failed } = await this.api.referential();
    for (const { code, error } of failed) {
      if (error.message !== 'retried later') {
        this.failed(
          `list:${code}`,
          'warn',
          `Cannot download the stations of ${code}: ${error.message}`,
        );
      }
    }
    for (const code of Object.keys(PORTALS)) {
      if (!failed.some((item) => item.code === code)) {
        this.recovered(`list:${code}`, `Stations of ${code} downloaded again`);
      }
    }
    return stations.length > 0 ? stations : null;
  }

  /** The station a token of the configuration designates, from the lists. */
  static find(stations, token) {
    if (token.kind === 'id') {
      return stations.find((station) => station.id === token.value) ?? null;
    }
    if (token.kind === 'number') {
      return stations.find((station) => station.number === token.value) ?? null;
    }
    const wanted = normalizeName(token.value);
    return (
      stations.find((station) =>
        [station.name, displayName(station), `${station.name} ${station.river ?? ''}`].some(
          (name) => normalizeName(name) === wanted,
        ),
      ) ?? null
    );
  }

  /**
   * Resolve the configuration into station ids. Ids of a supported state are
   * taken as they are (the readings say whether they exist); names and
   * numbers need the station lists. Without them, the stations found before
   * are kept.
   */
  async resolve() {
    const problems = { unknown: [], noHouse: false, tooMany: false };
    const ids = [];
    const add = (id) => {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    };
    const needList =
      this.config.homeRadiusKm > 0 || this.config.stations.some((token) => token.kind !== 'id');
    const stations = needList ? await this.stationList() : null;
    let complete = !needList || stations !== null;
    for (const token of this.config.stations) {
      if (token.kind === 'id') {
        if (PORTALS[token.value.slice(0, 2)]) {
          add(token.value);
        } else {
          problems.unknown.push(token.text);
        }
      } else if (stations) {
        const station = Monitor.find(stations, token);
        if (station) {
          add(station.id);
        } else {
          problems.unknown.push(token.text);
        }
      }
    }
    if (this.config.homeRadiusKm > 0 && stations) {
      try {
        const home = await this.homeStations(stations);
        if (home === null) {
          problems.noHouse = true;
        } else {
          home.forEach(add);
        }
        this.recovered('home', 'Stations around the house chosen again');
      } catch (err) {
        complete = false;
        this.failed(
          'home',
          'warn',
          `Cannot choose the stations around the house yet: ${err.message}`,
        );
      }
    }
    if (ids.length > MAX_STATIONS) {
      problems.tooMany = true;
      ids.length = MAX_STATIONS;
    }
    // A failed resolution keeps the stations found before it.
    this.configured = complete ? ids : [...new Set([...this.configured, ...ids])];
    this.problems = complete
      ? problems
      : { ...problems, unknown: [...new Set([...this.problems.unknown, ...problems.unknown])] };
    this.resolved = complete;
    for (const name of problems.unknown) {
      this.failed(`unknown:${name}`, 'warn', `Unknown station: ${name}`);
    }
  }

  /**
   * The first house of Gladys that has a location, or null. A failure to read
   * the houses throws with `strict` (the stations are chosen again later), and
   * resolves null otherwise (the search then asks for a location).
   */
  async house({ strict = false } = {}) {
    try {
      const houses = await this.gladys.getHouses();
      return (
        houses.find(
          (house) => Number.isFinite(house.latitude) && Number.isFinite(house.longitude),
        ) ?? null
      );
    } catch (err) {
      if (strict) {
        throw new Error(`cannot read the houses of Gladys: ${err.message}`, { cause: err });
      }
      this.failed('houses', 'warn', `Cannot read the houses of Gladys: ${err.message}`);
      return null;
    }
  }

  /** Stations of the list around a point, nearest first, with their distance. */
  static around(stations, origin, radiusKm) {
    return stations
      .filter((station) => station.latitude !== null && station.longitude !== null)
      .map((station) => ({
        station,
        km: distanceKm(origin.latitude, origin.longitude, station.latitude, station.longitude),
      }))
      .filter(({ km }) => km <= radiusKm)
      .sort((a, b) => a.km - b.km);
  }

  /**
   * The nearest gauges around the house that measure a water level and sent it
   * lately (HOME_STATIONS at most), chosen again once a day; null without a
   * located house.
   */
  async homeStations(stations) {
    const radius = this.config.homeRadiusKm;
    const cached = this.data.home;
    if (
      cached &&
      cached.radiusKm === radius &&
      this.now() - cached.at < this.timings.homeMaxAgeMs
    ) {
      return cached.ids;
    }
    const house = await this.house({ strict: true });
    if (!house) {
      return null;
    }
    const candidates = Monitor.around(
      stations.filter((station) => station.unit),
      house,
      radius,
    ).slice(0, HOME_CANDIDATES);
    const { readings, failed } = await this.api.read(candidates.map(({ station }) => station));
    if (failed.length > 0 && readings.size === 0) {
      throw new Error(failed[0].error.message);
    }
    const ids = candidates
      .map(({ station }) => readings.get(station.id))
      .filter((station) => station && this.isFresh(station.current?.W?.t))
      .slice(0, HOME_STATIONS)
      .map((station) => {
        this.data.stations[station.id] ??= { ...station, current: null, fetchedAt: this.now() };
        return station.id;
      });
    // The house coordinates are not stored: only the radius and the stations.
    this.data.home = { radiusKm: radius, ids, at: this.now() };
    return ids;
  }

  // --- Discovery and connection status -----------------------------------------

  discoveredDevices() {
    return this.followed()
      .map((id) => this.station(id))
      .filter(Boolean)
      .map((station) =>
        buildDevice(this.gladys, station, this.config.language, PORTALS[station.land]?.name),
      );
  }

  async publishDiscovered() {
    await this.gladys.publishDiscoveredDevices(this.discoveredDevices());
  }

  async updateConnectionStatus() {
    const { unknown, noHouse, tooMany } = this.problems;
    const parts = [];
    if (this.down.length > 0) {
      const names = this.down.map((code) => PORTALS[code]?.name ?? code).join(', ');
      parts.push(render(STATUS, 'down', { names }));
    }
    if (this.failing.has('home')) {
      parts.push(render(STATUS, 'homeFailed'));
    }
    if (unknown.length > 0) {
      parts.push(render(STATUS, 'unknown', { names: unknown.join(', ') }));
    }
    if (noHouse) {
      parts.push(render(STATUS, 'noHouse'));
    }
    if (tooMany) {
      parts.push(render(STATUS, 'tooMany', { max: MAX_STATIONS }));
    }
    if (this.resolved && this.followed().length === 0 && unknown.length === 0 && !noHouse) {
      parts.push(render(STATUS, 'none'));
    }
    const message = parts.length > 0 ? join(...parts) : undefined;
    // Connected while at least one followed state answers.
    const lands = new Set(this.followed().map((id) => id.slice(0, 2)));
    const allDown = lands.size > 0 && [...lands].every((code) => this.down.includes(code));
    const connected = !allDown && this.resolved;
    const key = JSON.stringify([connected, message]);
    if (key === this.statusMessage) {
      return;
    }
    this.statusMessage = key;
    await this.gladys.setConnectionStatus(connected, message).catch(() => {});
  }

  // --- Gladys events -----------------------------------------------------------

  async onDeviceCreated(device) {
    const id = stationIdOfId(this.gladys, device.external_id);
    if (!id) {
      return;
    }
    if (!this.data.readings[id]) {
      await this.runCycle({ again: true });
    }
    // The SDK forgot the states of the device: everything is published again.
    await this.publishStates([id]);
    this.requestRefresh();
  }

  async onDeviceDeleted() {
    // A station only followed through its device is no longer followed.
    await this.publishDiscovered();
    this.requestRefresh();
  }

  /** onPoll fallback: should_poll is false, but a Gladys polling anyway gets an answer. */
  async poll(device) {
    const id = stationIdOfId(this.gladys, device.external_id);
    if (!id) {
      return;
    }
    // Read again only if the last cycle is older than half the interval.
    if (this.now() - this.lastCycleAt >= (this.config.refreshMinutes * MINUTE) / 2) {
      await this.runCycle();
    } else {
      await this.publishStates([id]);
    }
  }

  // --- Cycles ------------------------------------------------------------------

  /** Run a cycle; `again`: if one is running, run a new one once it is over. */
  runCycle({ again = false } = {}) {
    if (this.stopped) {
      return this.running;
    }
    if (this.running) {
      if (again) {
        this.rerun ??= this.running.then(() => {
          this.rerun = null;
          return this.runCycle();
        });
        return this.rerun;
      }
      return this.running;
    }
    this.running = this.cycle()
      .then(() => this.recovered('cycle', 'Refresh cycles work again'))
      .catch((err) => this.failed('cycle', 'error', 'Refresh cycle failed', err))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  async cycle() {
    this.lastCycleAt = this.now();
    const before = this.discoveredKey();
    // Cheap when the station lists are fresh: they are downloaded once a week.
    await this.resolve();
    const ids = this.followed();
    const changed = await this.refreshReadings(ids);
    this.forget(ids);
    if (this.discoveredKey() !== before) {
      await this.publishDiscovered();
    }
    await this.publishStates(this.created());
    await this.updateConnectionStatus();
    await this.save();
    logger.debug(`Refresh cycle: ${ids.length} station(s)`);
    if (changed) {
      this.requestRefresh();
    }
  }

  discoveredKey() {
    return JSON.stringify(this.discoveredDevices());
  }

  /** Drop what is kept of the stations no longer followed (the house ones change). */
  forget(followed) {
    for (const table of [this.data.stations, this.data.readings, this.data.memory]) {
      for (const id of Object.keys(table)) {
        if (!followed.includes(id)) {
          delete table[id];
        }
      }
    }
  }

  readingOf(id) {
    this.data.readings[id] ??= { history: [] };
    return this.data.readings[id];
  }

  isFresh(time) {
    return typeof time === 'number' && this.now() - time <= this.timings.staleAfterMs;
  }

  /** Read the stations from their portals; resolves true when a reading changed. */
  async refreshReadings(ids) {
    if (ids.length === 0) {
      this.down = [];
      return false;
    }
    const wanted = ids.map((id) => this.data.stations[id] ?? placeholder(id));
    const { readings, failed, unknown } = await this.api.read(wanted);
    const down = failed.map(({ code }) => code);
    for (const { code, error } of failed) {
      this.failed(
        `readings:${code}`,
        'warn',
        `${PORTALS[code].name} unreachable: ${error.message}`,
      );
    }
    for (const code of this.down.filter((item) => !down.includes(item))) {
      this.recovered(`readings:${code}`, `${PORTALS[code].name} answers again`);
    }
    this.down = down;
    // Configured stations their state does not know: shown in the status.
    const missing = this.configured.filter((id) => unknown.includes(id));
    if (missing.length > 0) {
      this.problems.unknown = [...new Set([...this.problems.unknown, ...missing])];
      for (const id of missing) {
        this.failed(`unknown:${id}`, 'warn', `Unknown station: ${id}`);
      }
    }
    let changed = false;
    for (const [id, station] of readings) {
      const { current, ...info } = station;
      this.data.stations[id] = { ...info, current: null, fetchedAt: this.now() };
      changed = (await this.fold(id, this.data.stations[id], current)) || changed;
    }
    for (const id of ids) {
      changed = (await this.noteSilence(id)) || changed;
    }
    return changed;
  }

  /** Fold the current values of a station; fire the triggers of a new alert level. */
  async fold(id, station, current) {
    const reading = this.readingOf(id);
    let changed = false;
    for (const key of ['W', 'Q']) {
      const value = current?.[key];
      if (!value || value.t < (reading[key]?.t ?? -Infinity)) {
        continue;
      }
      const isNew = reading[key]?.t !== value.t;
      changed ||= isNew || reading[key]?.v !== value.v;
      reading[key] = { t: value.t, v: value.v };
      if (key === 'W' && isNew) {
        const unit = capabilities(station).heightUnit;
        reading.history = [
          { t: value.t, v: value.v },
          ...reading.history.filter(
            (point) => point.t < value.t && value.t - point.t <= this.timings.historyMs,
          ),
        ];
        const trend = trendOf(reading.history, unit);
        changed ||= trend !== reading.trend;
        reading.trend = trend;
      }
    }
    const stage = current?.W && Number.isInteger(current.stage) ? current.stage : null;
    if (current?.W && current.W.t >= (reading.W?.t ?? -Infinity)) {
      changed ||= stage !== reading.stage;
      reading.stage = stage;
      if (stage !== null && this.isFresh(current.W.t)) {
        await this.alertEvents(id, station, stage);
      }
    }
    return changed;
  }

  /** One info line (and a trigger) when a station goes silent, one when it comes back. */
  async noteSilence(id) {
    const reading = this.readingOf(id);
    const silent = !this.isFresh(this.lastReadingAt(id));
    if (silent === reading.silent) {
      return false;
    }
    const wasKnown = reading.silent !== undefined;
    reading.silent = silent;
    if (silent) {
      reading.trend = null;
    }
    const station = this.station(id) ?? placeholder(id);
    const name = displayName(station);
    if (!wasKnown) {
      logger.debug(`${name}: ${silent ? 'no recent reading' : 'readings are fresh'}`);
      return true;
    }
    if (silent) {
      logger.info(`${name}: no new reading for ${this.timings.staleAfterMs / HOUR} hours`);
    } else {
      logger.info(`${name}: readings are back`);
    }
    if (this.isCreated(id)) {
      const last = this.lastReadingAt(id);
      await this.gladys
        .publishSceneEvent(silent ? TRIGGERS.READINGS_STOPPED : TRIGGERS.READINGS_RESUMED, {
          station: stationIds(this.gladys, id).device,
          station_name: displayName(station),
          river: station.river ?? null,
          last_reading: last !== null ? formatDate(last, this.config.language) : null,
        })
        .catch((err) => logger.warn(`Readings event refused: ${err.message}`));
    }
    return true;
  }

  /** Last reading time of a station (ms), or null. */
  lastReadingAt(id) {
    const reading = this.data.readings[id];
    const times = ['W', 'Q'].map((key) => reading?.[key]?.t).filter((t) => typeof t === 'number');
    return times.length > 0 ? Math.max(...times) : null;
  }

  // --- Scene triggers ------------------------------------------------------------

  /**
   * Compare a new alert level with the one remembered. A memory older than a
   * day (a long restart) is renewed without firing anything.
   */
  async alertEvents(id, station, stage) {
    const memory = (this.data.memory[id] ??= {});
    const now = this.now();
    const previous = memory.stage;
    memory.stage = { value: stage, at: now };
    if (!previous || now - previous.at > this.timings.memoryMs || previous.value === stage) {
      return;
    }
    const raised = stage > previous.value;
    logger.info(`${displayName(station)}: alert level ${previous.value} -> ${stage}`);
    if (!this.isCreated(id)) {
      return;
    }
    const language = this.config.language;
    const reading = this.data.readings[id] ?? {};
    const key = raised ? TRIGGERS.ALERT_RAISED : TRIGGERS.ALERT_LOWERED;
    await this.gladys
      .publishSceneEvent(key, {
        station: stationIds(this.gladys, id).device,
        station_name: displayName(station),
        river: station.river ?? null,
        state: PORTALS[station.land]?.name ?? station.land,
        level: String(stage),
        level_name: LEVEL_NAMES[language][stage],
        previous_level: String(previous.value),
        previous_level_name: LEVEL_NAMES[language][previous.value],
        height: reading.W?.v ?? null,
        unit: capabilities(station).heightUnit,
        flow: reading.Q && this.isFresh(reading.Q.t) ? reading.Q.v : null,
      })
      .catch((err) => logger.warn(`${key} event refused: ${err.message}`));
  }

  // --- States ------------------------------------------------------------------

  /** The states of the given stations whose device exists. */
  statesOf(ids) {
    const states = [];
    const language = this.config.language;
    for (const id of ids) {
      const station = this.station(id);
      if (!station || !this.isCreated(id)) {
        continue;
      }
      const feature = stationIds(this.gladys, id);
      const has = capabilities(station);
      const reading = this.data.readings[id] ?? {};
      const fresh = (key) => reading[key] && this.isFresh(reading[key].t);
      const push = (externalId, state) =>
        states.push({ device_feature_external_id: externalId, state });
      if (has.height && fresh('W')) {
        push(feature.height, reading.W.v);
        if (reading.trend) {
          states.push({
            device_feature_external_id: feature.trend,
            text: capitalize(TREND_NAMES[language][reading.trend]),
          });
        }
      }
      if (has.alert_level && fresh('W') && Number.isInteger(reading.stage)) {
        push(feature.alert_level, reading.stage);
      }
      if (has.flow && fresh('Q')) {
        push(feature.flow, reading.Q.v);
      }
      const last = this.lastReadingAt(id);
      if (last !== null) {
        const date = formatDate(last, language);
        states.push({
          device_feature_external_id: feature.last_reading,
          text: this.isFresh(last) ? date : READINGS[language].staleSince({ date }),
        });
      }
    }
    return states;
  }

  async publishStates(ids) {
    const states = this.statesOf(ids);
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.recovered('publish', 'Publishing the states works again');
    } catch (err) {
      // Sent again at the next cycle (the SDK forgets what Gladys refused).
      this.failed('publish', 'warn', `Publishing the states failed: ${err.message}`);
    }
  }

  // --- Widget -------------------------------------------------------------------

  requestRefresh() {
    if (this.stopped) {
      return;
    }
    const now = this.now();
    const wait = this.lastRefreshAt + this.timings.widgetRefreshMs - now;
    if (wait <= 0) {
      this.lastRefreshAt = now;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } else if (this.timers && !this.refreshTimer) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        this.requestRefresh();
      }, wait);
      this.refreshTimer.unref?.();
    }
  }

  /** What the widget shows of one station. */
  view(id) {
    const station = this.station(id) ?? placeholder(id);
    const has = capabilities(station);
    const reading = this.data.readings[id] ?? {};
    const last = this.lastReadingAt(id);
    const fresh = this.isFresh(last);
    const value = (key) => (reading[key] && this.isFresh(reading[key].t) ? reading[key].v : null);
    const height = value('W');
    return {
      id,
      name: displayName(station),
      river: station.river ?? null,
      land: station.land,
      has,
      unit: has.heightUnit ?? 'cm',
      height,
      flow: value('Q'),
      level: height !== null && Number.isInteger(reading.stage) ? reading.stage : null,
      trend: fresh ? (reading.trend ?? null) : null,
      lastReadingAt: last,
      fresh,
    };
  }

  /** The time of the newest reading shown, for the attribution. */
  updatedAt(ids) {
    const times = ids.map((id) => this.lastReadingAt(id)).filter((t) => t !== null);
    return times.length > 0 ? Math.max(...times) : null;
  }

  // --- Search -------------------------------------------------------------------

  /** Stations matching the words (name, river; accents, case and umlauts ignored). */
  static matches(station, words) {
    const haystack = normalizeName(`${station.name} ${station.river ?? ''} ${station.id}`);
    return words.every((word) => haystack.includes(normalizeName(word)));
  }
}

function emptyData() {
  return {
    version: 1,
    stations: {},
    home: null,
    readings: {},
    memory: {},
  };
}
