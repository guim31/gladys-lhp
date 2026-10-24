# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Stored in `/data`** (`/data/lhp.json`): what it learnt about the followed gauges (id, name,
  river, coordinates of the gauge, unit, alert thresholds), the last readings and the last alert
  levels. No secret, no account, no token: the portals need none. The **house coordinates** are
  read from Gladys (manifest `location: true`) only to find the nearest gauges inside the
  container; they are never sent, stored nor logged.
- **Network**: HTTPS requests to public flood portals only: `www.hnd.bayern.de`,
  `www.hvz.baden-wuerttemberg.de`, `www.umwelt.sachsen.de`, `www.hochwasserportal.nrw`,
  `www.hlnug.de`, `hochwasser.rlp.de` and `www.hochwasserzentralen.de` (the LHP map, for the
  coordinates). Their pages are parsed as text, never executed. Nothing listens on the network.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the flood portals of the states.
