# Cloudflare Worker

A Cloudflare Worker that sits on top of [`backend/`](../backend/) and [`web/`](../web/). See [CLAUDE.md](CLAUDE.md) for agent conventions.

## Contents

- <a id="development"></a>[Development](reference-development.md)
- <a id="routing"></a>[Routing](reference-routing.md)
- <a id="gtm"></a>[GTM](reference-gtm.md)
- <a id="production-mode"></a>[Production Mode](reference-production-mode.md)
- <a id="indexing"></a>[Indexing](reference-indexing.md)
- <a id="websockets"></a>[WebSockets](reference-websockets.md)
- <a id="sitemaps"></a>[Sitemaps](reference-sitemaps.md)
- <a id="caching"></a>[Caching](reference-caching.md)
- <a id="sessions"></a>[Sessions](reference-sessions.md)
- <a id="bot-tiers"></a>[Bot Tiers](reference-bot-tiers.md)
- <a id="rate-limiting"></a>[Rate Limiting](reference-rate-limiting.md)
- <a id="geo-blocking"></a>[Geo-Blocking](reference-geo-blocking.md)
- <a id="headers"></a>[Headers](reference-headers.md)
- <a id="sentry-error-monitoring"></a>[Sentry Error Monitoring](reference-sentry-error-monitoring.md)
- <a id="caching-architecture"></a>[Caching Architecture](reference-caching-architecture.md)
- <a id="devci-vs-production-differences"></a>[Dev/CI vs. Production Differences](reference-dev-ci-vs-production-differences.md)
- <a id="deploy-vars"></a>[Deploy Vars](reference-deploy-vars.md)
- <a id="cf-headers-from-origin"></a>[CF Headers from Origin](reference-cf-headers-from-origin.md)
- <a id="related"></a>[Related](reference-related.md)

The Worker consumes `CF-Connecting-IP` to stamp `X-Forwarded-For` and defensively removes the
original header before origin fetches. Same-zone Cloudflare subrequests may regenerate it, so the
backend origin guard trusts the Worker-stamped `X-Forwarded-For` first; see [Headers](reference-headers.md).
