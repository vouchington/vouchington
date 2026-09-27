# Cloudflare Worker

Use [README.md](README.md) for routing, caching, deployment variables, commands, and runtime
architecture. Use [tests.md](../docs/development/tests.md) for validation commands and the linked
runbooks for staging operations. Before adding or changing a Vitest test, fixture, or mock, load the
[vitest-test-authoring skill](../.agents/skills/vitest-test-authoring/SKILL.md).

## Scoped invariants

- `NOINDEX=true` must add the staging robots header, disallow crawling in `/robots.txt`, and omit
  sitemap discovery from every public discovery surface.
- Staging Basic Auth is rate-limited before credential validation. Keep exempt path/method pairs in
  `src/basic-auth.mts`, and strip both supported Basic headers before every origin and cache RPC.
- `/infra/edge-cache-canary` and every fault-control header are non-discoverable validation surfaces,
  stripped before origins, and hard-disabled when `PRODUCTION=true`. The operator-authenticated
  smoke procedure owns live staging validation of these protected surfaces; the private
  infrastructure deployment receiver has neither required credential.
- JWT verification at the edge decides cache bypass only. Backend session validation and revocation
  remain authoritative; never grant access or higher rate-limit tiers from uid-bearing claims.
- Keep CSP in `src/csp.mts`. Third-party SDK origins must be allowed in both `script-src` and
  `connect-src`.
- Return edge failures through `edgeErrorResponse()`, not ad hoc plain-text `Response` objects.
- Preserve origin streaming. When buffering a body, create the reader inside `try`, read
  sequentially, and cancel early without blocking; follow `readEnvelopeWithLimit` in
  `src/sentry-tunnel.mts`.
- The Worker is the sole HTTP caching layer; Next.js must not emit `Cache-Control`.
- Public discovery may advertise only unauthenticated resources, plus the exact agent-interface
  paths in `ADVERTISED_AGENT_INTERFACE_PATHS`, which never go in `Link` headers. Add private route
  classification to `@ts-shared/route-classification`, not consumer-local lists. Follow
  [SEO discovery requirements](../docs/requirements/seo/SEO.md#machine-readable-discovery).
- `CACHE_PLACEHOLDER_NONCE` is a secret fixed per deployment and rewritten per request. Never log it
  or regenerate it per request; follow the
  [anonymous-cache CSP design](../docs/overview/architecture/anon-html-edge-caching-csp.md).

## Operations

- Worker scripts: [scripts/README.md](scripts/README.md)
- Rotate staging credentials through the
  [Basic Auth runbook](../docs/operations/cloudflare-worker-staging-auth.md).
- Validate public federation exemptions and remote server behavior through the
  [fediverse staging interoperability runbook](../docs/operations/fediverse-staging-interop.md).
- The private infrastructure receiver owns pre-deployment origin-binding checks. Operators own the
  authenticated live staging gate, canary, and fault-control checks in the Basic Auth runbook.
- The private-infrastructure-managed docs Worker serves the internal landing page, OpenAPI, and
  psql schema from R2 behind required Basic Auth. Its credentials are an encrypted Cloudflare
  binding managed outside GitHub Actions; see `src/docs.mts` and the
  [private docs site runbook](../docs/operations/private-docs-site.md).
