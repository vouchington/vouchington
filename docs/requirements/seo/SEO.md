# SEO Requirements

Public, crawlable pages carry full metadata and a visible `h1`; internal, authenticated, or
operational pages are `noindex, nofollow`. Metadata, breadcrumbs, and structured data are read from
`web/lib/seo` and the page code; this page records the rules behind them.

## Sitemap Alignment

Web indexability must stay aligned with sitemap eligibility. A post with a positive net vote score
is indexable and may appear in the sitemap; otherwise it must be `noindex` and absent from the
sitemap. Do not change one side without changing the other.

## Structured Data

- Anonymous posts and comments must omit the `author` field entirely.
- Comment structured data is truncated and capped to keep payloads reasonable.
- `/plans` is a public marketing page that intentionally omits breadcrumbs.

## Robots

- `robots.txt` must reference the sitemap
- `robots.txt` should disallow obvious internal route prefixes
- `/md/` is intentionally crawlable because `/llms.txt` advertises public markdown endpoints for agents; non-public markdown responses must still return 404 from the backend.
- Route-level `noindex` is still required even when `robots.txt` disallows a path

## Machine-Readable Discovery

- `/llms.txt`, `/.well-known/api-catalog`, and HTTP `Link` headers must advertise only public unauthenticated resources. The one exception is the exact-path agent-interface allowlist in [Agent Access](../platform/agent-access.md): discovery documents may name those authenticated interfaces, and `Link` headers never do.
- Do not include any other authenticated/private routes, internal URLs, or bearer-token query strings such as RSS `apikey`.
- RSS endpoints may support API keys for identity rate limiting, but discovery surfaces must use only anonymous public feed URLs.
- **Single source of truth**: route classification is centralized in `@ts-shared/route-classification`. The Cloudflare Worker imports `isPrivateDiscoveryPath` and `ROBOTS_DISALLOW_PREFIXES` from this package; the web app imports `PUBLIC_STATIC_SITE_NAV_PATHS`, `INDEXABLE_TOPIC_SUBPAGES`, and `COMMUNITY_PUBLIC_RESERVED_SEGMENTS`. When adding a new private route, update `ts-shared/route-classification/patterns.mts` — not the individual consumer files.

## What We Deliberately Do NOT Do (and Why)

These tactics are sometimes suggested for "AI SEO" but are **explicitly listed as misconceptions** in [Google's AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide):

- **No special `/llms.txt` optimization for Google AI Overviews** — Google says `/llms.txt` does not improve visibility in AI Overviews. Voucha does serve `/llms.txt` per the [llmstxt.org](https://llmstxt.org) spec as a discovery mechanism for `/md/*` routes and the user MCP server, but this is not a Google AI ranking signal.
- **No "chunked" content for AI consumers** — violates the spirit of people-first content.
- **No per-query-variation pages** — classified as scaled content abuse.
- **No FAQPage/HowTo schemas invented for AI** — only add these where the page genuinely is an FAQ or how-to.

## Related

- [Web rules](../../../web/AGENTS.md)
- [Backend rules](../../../backend/AGENTS.md)
