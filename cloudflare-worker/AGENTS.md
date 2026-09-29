# Cloudflare Worker

- Use [Worker docs](../docs/overview/infrastructure/cloudflare-worker/README.md), [tests](../docs/development/tests.md), and [script/runbook index](../docs/overview/infrastructure/cloudflare-worker/scripts/README.md); load [Vitest authoring](../.agents/skills/vitest-test-authoring/SKILL.md) for tests/fixtures/mocks.
- `NOINDEX=true` adds staging robots headers, disallows `/robots.txt` crawling, and removes sitemap discovery from every public surface.
- Rate-limit staging Basic Auth before validating credentials. Exempt path/method pairs belong in `src/basic-auth.mts`; strip both Basic headers before origin/cache RPCs.
- `/infra/edge-cache-canary` and fault-control headers are undiscoverable, stripped before origins, and disabled under `PRODUCTION=true`. Operators own authenticated live staging checks; the private receiver lacks those credentials. Follow [Basic Auth operations](../docs/operations/cloudflare-worker-staging-auth.md).
- Edge JWT verification controls cache bypass only; backend pairing/revocation remains authoritative. Claims never grant access or higher rate-limit tiers.
- CSP belongs in `src/csp.mts`; SDK origins need both `script-src` and `connect-src`. `CACHE_PLACEHOLDER_NONCE` is deployment-fixed, secret, never logged/regenerated per request, and rewritten per request; follow [anonymous-cache CSP](../docs/overview/architecture/anon-html-edge-caching-csp.md).
- Use `edgeErrorResponse()` for failures. Preserve origin streaming; bounded buffering creates readers inside `try`, reads sequentially, and cancels early without blocking (`readEnvelopeWithLimit` in `src/sentry-tunnel.mts`).
- The Worker alone owns HTTP caching; Next.js never emits `Cache-Control`.
- Discovery advertises unauthenticated resources plus exact `ADVERTISED_AGENT_INTERFACE_PATHS`, never advertising agent interfaces in `Link` headers. Private classification belongs in `@ts-shared/route-classification`; follow [SEO discovery](../docs/requirements/seo/SEO.md#machine-readable-discovery).
- Private infrastructure owns pre-deploy origin-binding checks. Operators own [fediverse interoperability](../docs/operations/fediverse-staging-interop.md); the private docs Worker's required Basic Auth uses encrypted Cloudflare bindings outside Actions, per [docs-site operations](../docs/operations/private-docs-site.md) and `src/docs.mts`.
