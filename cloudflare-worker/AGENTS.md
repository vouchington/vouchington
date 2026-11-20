# Cloudflare Worker

- Worker docs: [Cloudflare Worker index](../docs/overview/infrastructure/cloudflare-worker/README.md).
- `NOINDEX=true` adds staging robots headers, disallows `/robots.txt` crawling, and removes sitemap
  discovery from every public surface.
- Rate-limit staging Basic Auth before validating credentials. Exempt path/method pairs belong in
  `src/basic-auth.mts`; strip both Basic headers before origin/cache RPCs.
- `/infra/edge-cache-canary` and fault-control headers are undiscoverable, stripped before origins,
  and disabled under `PRODUCTION=true`.
- CSP belongs in `src/csp.mts`; SDK origins need both `script-src` and `connect-src`.
  `CACHE_PLACEHOLDER_NONCE` is deployment-fixed, secret, never logged/regenerated per request, and
  rewritten per request.
- Use `edgeErrorResponse()` for failures. Preserve origin streaming; bounded buffering creates
  readers inside `try`, reads sequentially, and cancels early without blocking.
- Discovery advertises unauthenticated resources plus exact `ADVERTISED_AGENT_INTERFACE_PATHS`,
  never advertising agent interfaces in `Link` headers. Private classification belongs in
  `@ts-shared/route-classification`.
