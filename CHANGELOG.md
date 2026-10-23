# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- One Gladys device per gauge of the flood portals of Bavaria, Baden-Württemberg, Saxony, North
  Rhine-Westphalia, Hesse and Rhineland-Palatinate (Länderübergreifendes Hochwasserportal): water
  level (cm, or m above sea level for lakes and reservoirs), flow (m³/s) when measured, flood
  alert level 0 to 4 of the state when the gauge is rated, trend (rising, steady, falling) and the
  date of the last reading. A gauge without a new reading for 6 hours says "No new reading
  since…" instead of showing an old value as fresh.
- Stations chosen by id (`BY_16005701`, the ids of the Home Assistant integration
  "hochwasserportal"), gauge number or name (umlauts and case ignored), or the 3 nearest gauges
  that send readings around the house (10, 20 or 50 km), chosen without sending the house
  location anywhere.
- "Find stations" in the Configuration screen: around the house, by name, by river, by state or
  by id, with the distance and current level.
- Scene triggers "Flood alert level reached or raised", "Flood alert level lowered", "Gauge
  stopped sending readings" and "Gauge sends readings again".
- Dashboard widget "Hochwasserportal": followed gauges with level and trend, coloured by alert
  level, or the detail of one gauge.
- Refresh every 15, 20 or 30 minutes by the integration itself, with one request per state for
  Bavaria, Baden-Württemberg and Saxony, without relying on Gladys polling. A state portal that
  fails does not stop the others.
- Texts and documentation in English, French, German and Spanish.
