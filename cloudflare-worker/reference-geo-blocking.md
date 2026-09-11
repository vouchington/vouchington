# Geo-Blocking

[Back to Cloudflare Worker](README.md#geo-blocking)

Requests from sanctioned/restricted countries are rejected at the edge before reaching any origin. Cloudflare automatically sets `CF-IPCountry` on every request with the ISO 3166-1 Alpha-2 country code — no external lookups required.

**Configuration:** `GEO_BLOCKED_COUNTRIES` env var — comma-separated country codes (e.g. `"CN,IR,RU"`).

- Empty or unset → blocking disabled (safe for local dev)
- `CF-Ray` absent (local dev / CI, no Cloudflare in front) → request allowed regardless of `CF-IPCountry`
- `CF-Ray` present + `CF-IPCountry` missing → `403 Access denied` (fail-closed: anomalous edge request)
- Blocked country → `403 Access denied` (does not reveal the blocking mechanism)

**Default list** (set by private infrastructure for deployed Workers): `CN,HK,IR,RU,KP,BY,SY,VE,CU,MM,SD`

Blocking happens before cookie parsing, JWT verification, and rate limiting so blocked requests consume no quota and no CPU-intensive work.

Tor exit nodes (`T1`) and unknown country (`XX`) are not blocked by default but can be added via the env var.

**Module:** [`src/geo-block.mts`](src/geo-block.mts) — two pure functions: `parseBlockedCountries()` and `isGeoBlocked()`.
