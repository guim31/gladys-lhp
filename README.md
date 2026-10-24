# Hochwasserportal for Gladys Assistant

![Hochwasserportal](cover.png)

A [Gladys Assistant](https://gladysassistant.com) external integration for the **flood portals
of the German states** (Länderübergreifendes Hochwasserportal, LHP): water levels, flows and
**official flood alert levels** (Meldestufen 1 to 4) of the gauges of Bavaria,
Baden-Württemberg, Saxony, North Rhine-Westphalia, Hesse and Rhineland-Palatinate, about 2,100
gauges. No account, no key.

**How it differs from [PEGELONLINE](https://github.com/guim31/gladys-pegelonline):**
PEGELONLINE covers the federal waterways (Rhine, Elbe, Danube, canals) with their mean and
navigation levels. This integration covers the smaller rivers watched by the states (Isar,
Neckar, Lahn, Ruhr, Mulde…), with the alert levels the states publish. Both can run side by
side.

> Not a flood warning service: in a flood, follow the official warnings of your state and your
> municipality.

## Features

- **One device per gauge**: water level (cm, or m above sea level for lakes and reservoirs),
  flow (m³/s), flood alert level 0 to 4 when the state rates the gauge, trend (rising, steady,
  falling) and the date of the last reading. An old value is never published as fresh.
- **Scene triggers**: flood alert level reached or raised, lowered; a gauge stops sending
  readings, sends them again. A threshold of your own stays a native Gladys condition on the
  water level.
- **Dashboard widget**: your gauges with level and trend, coloured by alert level, or the
  detail of one gauge.
- **Find stations**: around your house, by name, by river, by state or by id, with the current
  level.
- Station ids are the ones of the Home Assistant integration
  [hochwasserportal](https://github.com/stephan192/hochwasserportal) (`BY_16005701`): a list
  from Home Assistant can be pasted as is.
- Four languages: English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later, with Internet access.
- For "around my house": the location of your house in Gladys.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-lhp` (or install it from the catalog once it is listed).
   The install screen shows the **location** access it asks for.
2. In **Configuration**, press **Find stations**, copy the ids you want into **Stations** (or
   choose **Around my house**), then save.
3. Open the **Discover** tab and press **Add to Gladys** on the gauges you want.

The user guide is in [`docs/en.md`](docs/en.md) ([français](docs/fr.md), [Deutsch](docs/de.md),
[español](docs/es.md)); Gladys links it from the Configuration screen.

## How it works

There is no common API: the LHP map shows the alert level of the gauges, but the water levels
stay on the portal of each state. The integration reads, every 15 minutes at most:

| State                  | Source                                   | Requests per cycle |
| ---------------------- | ---------------------------------------- | ------------------ |
| Bavaria                | `www.hnd.bayern.de/pegel` (HTML page)    | 1 for every gauge  |
| Baden-Württemberg      | `www.hvz.baden-wuerttemberg.de` (script) | 1 for every gauge  |
| Saxony                 | `www.umwelt.sachsen.de` (HTML page)      | 1 for every gauge  |
| North Rhine-Westphalia | `www.hochwasserportal.nrw` (WISKI JSON)  | 1 per gauge        |
| Hesse                  | `www.hlnug.de` (WISKI JSON)              | 2 per gauge        |
| Rhineland-Palatinate   | `hochwasser.rlp.de/api/v1` (JSON)        | 1 per gauge        |
| Coordinates            | `www.hochwasserzentralen.de` (LHP map)   | once a week        |

The station lists are kept a week in memory. Bavaria and Saxony publish the alert level itself;
for the other states it is computed from the official thresholds, as lhpapi does. A state portal
that fails does not stop the others. The house location never leaves the container.

## Limitations

- **Not supported yet**: Berlin, Brandenburg, Bremen, Hamburg, Mecklenburg-Western Pomerania,
  Lower Saxony, Saarland, Saxony-Anhalt, Schleswig-Holstein and Thuringia. Each needs its own
  reader (mostly HTML pages): contributions welcome, one module in `src/lands/`.
- The portals of Bavaria and Saxony are web pages: a change of their layout stops their
  readings until the integration is updated.
- No flow in North Rhine-Westphalia, no forecast.
- "Around my house" only sees the gauges whose coordinates are known (every gauge in
  Baden-Württemberg, North Rhine-Westphalia and Hesse; the flood reporting gauges elsewhere).
- 20 stations at most from the configuration.

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm install
npm test              # node --test, against the SDK's fake Gladys and recorded portal answers
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store --skip-image-check .   # store validator
```

The architecture is described in [`CLAUDE.md`](CLAUDE.md). Versions are bumped by the
**Release** workflow (Actions → Release), never by hand.

## Credits

- Data: the flood centres of the German states (HND Bayern / LfU, HVZ Baden-Württemberg / LUBW,
  LHWZ Sachsen / LfULG, LANUK NRW, HLNUG Hessen, LfU Rheinland-Pfalz), joined in the
  [Länderübergreifendes Hochwasserportal](https://www.hochwasserzentralen.de).
- The parsing of the portals follows [stephan192/lhpapi](https://github.com/stephan192/lhpapi)
  (Apache-2.0), the library of the Home Assistant integration
  [stephan192/hochwasserportal](https://github.com/stephan192/hochwasserportal); rewritten in
  JavaScript, no code copied.
- The cover shows the LHP logo, from [hochwasserzentralen.de](https://www.hochwasserzentralen.de)
  (`images/logo_lhp3.svg`), on the blue of the portal.

Not affiliated with the LHP nor with the flood centres of the states.

## License

Apache-2.0, see [LICENSE](LICENSE).
