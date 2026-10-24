// -----------------------------------------------------------------------------
// The configuration: tokens of the "Stations" field, name comparison, defaults.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, normalizeName, parseStations } from '../src/config.js';

test('station tokens: ids (any case), numbers and names with spaces', () => {
  const tokens = parseStations(
    'by_16005701, München Isar; 16005701\nSchöna / Elbe, BY_16005701, ,',
  );
  assert.deepEqual(
    tokens.map(({ kind, value }) => [kind, value]),
    [
      ['id', 'BY_16005701'],
      ['name', 'München Isar'],
      ['number', '16005701'],
      ['name', 'Schöna / Elbe'],
    ],
  );
});

test('names compare without case, accents, umlauts nor punctuation', () => {
  assert.equal(normalizeName('KÖLN'), normalizeName('Koeln'));
  assert.equal(normalizeName('köln'), 'koln');
  assert.equal(normalizeName('München / Isar'), normalizeName('Muenchen Isar'));
  assert.equal(normalizeName('Straßburg'), normalizeName('STRASSBURG'));
  assert.equal(normalizeName('Sankt  Aldegund-UP'), 'sankt aldegund up');
});

test('defaults, and unknown values fall back to them', () => {
  assert.deepEqual(normalizeConfig({}), {
    stations: [],
    homeRadiusKm: 0,
    refreshMinutes: 15,
    language: DEFAULT_CONFIG.language,
  });
  const config = normalizeConfig({ around_home: '7', refresh_interval: '1', language: 'it' });
  assert.deepEqual([config.homeRadiusKm, config.refreshMinutes, config.language], [0, 15, 'fr']);
  assert.equal(normalizeConfig({ around_home: '50', refresh_interval: '30' }).homeRadiusKm, 50);
  assert.deepEqual(normalizeConfig(null).stations, []);
});
