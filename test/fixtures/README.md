# Test fixtures

- `gladys-feature-table.json`: the category/type couples, units and poll frequencies the Gladys
  core and front know (extracted from the Gladys code), used by `test/gladys-rules.test.js`.
- `lhp/`: real answers of the state portals, recorded on 24/10/2026 around 01:15 (German summer
  time), cut down to a few gauges and otherwise kept byte for byte (public data of public
  gauges; excluded from Prettier):
  - `by-pegel-…html`: four gauges of `https://www.hnd.bayern.de/pegel` (München and Kempten with
    level, flow and Meldestufe; Neu-Ulm Q, flow only; Bertoldsheim OW, a reservoir in m);
  - `bw-hvz_peg_stmn-…txt`: four rows of `https://www.hvz.baden-wuerttemberg.de/js/hvz_peg_stmn.js`
    (`.txt`: `node --test` would run a `.js` file of `test/`);
  - `sn-wasserstand-uebersicht-…html`: three gauges of the Saxon overview page (an alert gauge,
    a gauge without alert levels, a gauge without current data);
  - `nw-…`, `he-…`: the WISKI station lists (reduced) and the week series of Bachum (Ruhr) and
    Marburg (Lahn), with the Hessian alarm levels;
  - `rp-…`: the configuration of `hochwasser.rlp.de` reduced to Trier (Mosel) and Auw an der
    Kyll (a municipal gauge), and their measurement sites;
  - `lhp-…`: the line of the LHP home page that passes the map key, and five entries of the map.

No gauge was on alert that day: `test/helpers/world.js` serves these answers as the portals
would and writes new readings and alert levels into them, in the format of each state.
