# Security Architecture

Orientation for the security posture across the Cloudflare Worker, backend, and web layers. The
code is the source of truth for headers, limits, and routes.

- **Edge is authoritative.** The Cloudflare Worker sets security headers on every response and
  strips client-supplied auth headers, so browser authority is cookie-only. Backend routes serve
  APIs and normally carry no CSP.
- **CSRF.** No tokens; layered defenses make a forged request impossible to construct. See
  [CSRF](./CSRF.md).
- **Authentication.** Cookie sessions for browsers, bearer credentials for native and server
  clients. See [Authentication architecture](../../overview/architecture/auth-overview.md) and
  [OAuth authorization server](./OAUTH-AUTHORIZATION-SERVER.md).
- **SSRF.** Every outbound fetch of a user-supplied URL (URL addition, crawling, image sideloads,
  OAuth metadata documents) goes through the shared SSRF-safe, DNS-pinned HTTP boundary, and
  creation is gated before any fetch.
- **Honeypots and scraping.** Public forms carry honeypot fields, and pagination depth and robots
  directives limit scraping.
- **Telemetry.** Least-data collection and mandatory scrubbing: see
  [Sentry scrubbing](reference-security-observability-scrubbing.md).
