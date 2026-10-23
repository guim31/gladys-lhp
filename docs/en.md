# Hochwasserportal

Brings the **water levels, flows and flood alert levels of the gauges of the German states**
into Gladys: the smaller rivers that the flood centres of the Länder watch (Isar, Neckar, Lahn,
Ruhr, Mulde…), with their **official alert levels** (Meldestufen 1 to 4). The data comes from
the state portals joined in the **Länderübergreifendes Hochwasserportal** (LHP,
hochwasserzentralen.de). No account, no key.

Supported states: **Bavaria, Baden-Württemberg, Saxony, North Rhine-Westphalia, Hesse and
Rhineland-Palatinate** (about 2,100 gauges, 900 of them with alert levels).

> **Not a flood warning service.** Data can be late, missing or wrong, and the integration
> depends on your Gladys, your Internet access and public services. In a flood, follow the
> official warnings (the flood centre of your state, your municipality, 112). This integration
> is not affiliated with the flood centres of the states.

How it differs from the **PEGELONLINE** integration: PEGELONLINE covers the federal waterways
(Rhine, Elbe, Danube, canals) with their mean and navigation levels; this one covers the
gauges of the states, with the alert levels the states publish. Both can run side by side.

## What you get

- **One device per gauge** you follow: the **water level** (in cm, as on the state portal; in m
  above sea level for lakes and reservoirs), the **flow** in m³/s when the gauge measures it,
  the **flood alert level** from 0 (no flood) to 4 when the state rates the gauge, the
  **trend** (rising, steady, falling) and the date of the last reading.
- A gauge that stops sending is shown as such ("No new reading since…"): an old value is never
  sent again as if it were fresh.
- Four **scene triggers**: the alert level goes up, the alert level goes down, a gauge stops
  sending readings, and sends them again.
- A **dashboard widget**: your gauges, their level, its trend, coloured by their alert level.
- A **"Find stations"** button that lists the gauges around your house, by name, by river or by
  id, with their current level.

## Requirements

- Gladys Assistant **5.1.0** or later.
- Internet access from Gladys: the integration reads the portals of the states
  (`www.hnd.bayern.de`, `www.hvz.baden-wuerttemberg.de`, `www.umwelt.sachsen.de`,
  `www.hochwasserportal.nrw`, `www.hlnug.de`, `hochwasser.rlp.de`) and the LHP map
  (`www.hochwasserzentralen.de`) for the coordinates.
- For "around my house": the location of your house in Gladys (Settings, Houses). The
  integration asks for it at installation (the "location" permission). It is only used inside
  the container to find the nearest gauges: never sent to any portal, never stored nor logged.

## Configuration

### Settings

- **Stations**: station ids, gauge numbers or names, separated by commas. The id is the state
  code, an underscore and the number of the gauge: `BY_16005701` (München, Isar). It is the id
  of the Home Assistant integration "hochwasserportal": a list from Home Assistant can be
  pasted as it is. A name can carry its river: `Plochingen Neckar`, `Marburg / Lahn`; case,
  accents and umlauts do not matter (`Muenchen` finds `München`).
- **Around my house**: also follow the 3 nearest gauges that send readings, within 10, 20 or
  50 km. Only the gauges whose coordinates are known count: all of them in Baden-Württemberg,
  North Rhine-Westphalia and Hesse, the flood reporting gauges of the LHP map in Bavaria, Saxony
  and Rhineland-Palatinate.
- **Refresh interval**: 15 (default), 20 or 30 minutes. Most gauges send a reading every 15
  minutes.
- **Language of the feature names**: names given to the features of new devices (French by
  default), and language of the texts (trend, last reading) and of the scene variables.

Save, then open the **Discover** tab and create the devices you want.

### Finding your stations

The **Find stations** button of the configuration lists up to 10 gauges with their id, river,
distance from your house and current water level:

- empty: the gauges around your house (20 km, or the distance chosen);
- a name or a river: `München`, `Isar`, `Neckar Plochingen`;
- a state: `BY_`, `SN_`…;
- an id or a number: `BY_16005701`, `16005701`.

Copy the ids into **Stations**, then save. You can also find a gauge on the portal of its state
(see "Data sources") and take its number from the address of its page.

## Devices

Each device is named "Station / River" (`München / Isar`), model "Hochwasserportal · Bayern".
Its features, when the gauge has them:

| Feature                    | Type in Gladys       | Value                                       |
| -------------------------- | -------------------- | ------------------------------------------- |
| Water level                | Liquid depth (cm, m) | as on the state portal                      |
| Flow (m³/s)                | Water flow           | m³/s (Gladys has no m³/s unit)              |
| Flood alert level (0 to 4) | Risk level           | 0 no flood, 1 to 4 the alert level          |
| Trend                      | Text                 | Rising, Steady, Falling (over about 1 hour) |
| Last reading               | Text                 | date, or "No new reading since…"            |

The **alert level** is the one of the state: Meldestufe in Bavaria, Baden-Württemberg, Hesse
and Rhineland-Palatinate, Alarmstufe in Saxony, Informationsstufe in North
Rhine-Westphalia (3 levels there and in Hesse). Bavaria and Saxony publish the level itself;
for the other states, it is computed from the official thresholds the state publishes, as the
Home Assistant integration does. A gauge without alert levels has no such feature.

A threshold of your own ("the Lahn above 300 cm") is a native Gladys scene condition on the
**Water level** feature: no trigger of the integration is needed.

## Dashboard widget

Add the **Hochwasserportal** widget to a dashboard.

- Without setting: one line per gauge (10 at most), its water level and trend, coloured by its
  alert level (green 0, orange 1 and 2, red 3 and 4, grey without a level or a recent reading).
  A heading names the gauges on alert.
- With a station chosen: its live water level and flow, its alert level, trend and last
  reading, and a button to its page on the state portal.

## Scene triggers

- **Flood alert level reached or raised**: the alert level of a gauge goes up. Filter by
  station and by new level (1 to 4).
- **Flood alert level lowered**: the alert level goes down. Filter by station and by new level
  (0 to 3).
- **Gauge stopped sending readings**: no new reading for 6 hours (failure, maintenance, a gauge
  damaged by a flood…).
- **Gauge sends readings again**.

Variables: station name, river, state, new and previous level (number and words), water level
and its unit, flow; the date of the last reading for the last two.

## Scene examples

- **Flood on the Isar**: trigger "Flood alert level reached or raised", station München / Isar,
  level 2, 3 or 4 → send a message "{{triggerEvent.data.station_name}}:
  {{triggerEvent.data.level_name}}, {{triggerEvent.data.height}} cm" and switch on a red light.
- **All clear**: trigger "Flood alert level lowered", level 0 → message "Back to normal at
  {{triggerEvent.data.station_name}}".
- **Your own threshold**: Gladys trigger "a device feature changes", Water level of Marburg /
  Lahn above 350 → switch on the basement pump, notify.
- **Silent gauge during a flood**: trigger "Gauge stopped sending readings" → message "No data
  from {{triggerEvent.data.station_name}} since {{triggerEvent.data.last_reading}}".

## Data sources, licence and quotas

- Bavaria: Hochwassernachrichtendienst Bayern (Bayerisches Landesamt für Umwelt),
  www.hnd.bayern.de, one page for every gauge.
- Baden-Württemberg: Hochwasservorhersagezentrale (LUBW), www.hvz.baden-wuerttemberg.de, one
  file for every gauge.
- Saxony: Landeshochwasserzentrum (LfULG), www.umwelt.sachsen.de, one page for every gauge.
- North Rhine-Westphalia: Hochwasserportal NRW (LANUK), one file per gauge.
- Hesse: HLNUG, one file per gauge and parameter, the thresholds once a day.
- Rhineland-Palatinate: Hochwassermeldedienst (LfU), hochwasser.rlp.de, one request per gauge.
- Coordinates: the map of the Länderübergreifendes Hochwasserportal, once a week.

The data are public and read without an account; the integration asks every 15 minutes at
most, names itself in its requests (User-Agent) and keeps the station lists a week in memory.
The portals publish no API terms: please do not lower the interval. Credits: the parsing
follows the Python library [lhpapi](https://github.com/stephan192/lhpapi) (Apache 2.0) of the
Home Assistant integration "hochwasserportal".

## Troubleshooting

- **"Unknown station"**: check the id with "Find stations". States other than the six above
  are not supported yet.
- **"No answer from the portal of …"**: that state portal is down or has changed; the other
  states go on. The readings come back with it. If it lasts, open an issue: the portals are web
  pages, and their format can change.
- **No alert level on a gauge**: the state does not rate this gauge (not a flood reporting
  gauge).
- **"No new reading since…"**: the gauge sends nothing (failure, maintenance, ice). Some
  gauges send their values in batches, a few hours late.
- **"Around my house" adds nothing**: no gauge with known coordinates within the distance;
  choose a larger distance or type the stations.
- Logs: `LOG_LEVEL=debug` shows every refresh cycle.

## Limits

- Six states out of sixteen: Berlin, Brandenburg, Bremen, Hamburg, Mecklenburg-Western
  Pomerania, Lower Saxony, Saarland, Saxony-Anhalt, Schleswig-Holstein and Thuringia are not
  supported yet (see the README).
- The portals of Bavaria and Saxony are web pages read as such: a change of their layout
  stops their readings until the integration is updated.
- No flow in North Rhine-Westphalia (not published as a file), no forecast.
- The trend needs about an hour of readings after the start.
- 20 stations at most from the configuration.
