# Security Architecture reference

[Back to Security Architecture](SECURITY.md)

## SSRF Protection

Server-Side Request Forgery (SSRF) protection prevents user-submitted URLs from causing the server to make requests to internal/private network resources.

### URL Addition (`addUrls`)

When URLs are added via `@services/urls/upsert`, a synchronous public-host check blocks entries with private IP literals or reserved hostnames before they are stored. `addUrl()` rejects those inputs with a 422; `addUrls()` skips non-public entries so mixed ingestion batches can still store the public URLs. Only IP literals are checked (domain names that incidentally start with a private prefix, e.g. `10.example.com`, are allowed through). The check blocks:

- IP literals in private ranges: `10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`, `127.x.x.x`, `169.254.x.x`, `0.0.0.0`
- Legacy IPv4 literal encodings for those private ranges, including single
  32-bit integers, shortened dotted notation, hexadecimal components, and octal
  components
- IPv6 private IP literals: `::`, `::1`, `::ffff:<private-ipv4>`, `fc00::/7` (`fc**`/`fd**`), `fe80::/10` (`fe80`–`febf`)
- Hostnames: `localhost`, `*.local`
- Plain `http:` URLs are silently upgraded to `https:` before storage (via `normalizeUrlForUrlTable`). URL fragments are stripped before insertion because `urls.url` stores fetchable resources, not document anchors. Other non-http(s) schemes (`javascript:`, `data:`, `ftp:`, `file:`, `mailto:`, …), invalid URLs, and URL-table length violations cause `addUrl()`/`addUrls()` to throw.

### Crawler (`crawl-url.mts`)

Two-phase SSRF protection in `crawlUrl`:

1. **Synchronous check (before robots.txt)**: IP literals and `localhost`/`.local` hostnames are rejected immediately before any outbound traffic, preventing SSRF via the robots.txt fetch.

2. **Async DNS check (inside try block, before HTTP fetch)**: `validateUrl()` from [`ssrf-guard/node`](https://www.npmjs.com/package/ssrf-guard) resolves the hostname and verifies all IPs are public. This catches DNS-rebinding and split-horizon attacks where a public hostname resolves to a private IP. On detection, the crawl is recorded with `network_error: 'ssrf'` and `response_status_code: 403`.

   This step is a bounded phase with its own budget, not an unbounded wait on the outer fetch (#10772): `resolveSafeCrawlerAddresses()` (`backend/services/crawls/crawl-url/safety.mts`) passes `timeoutMs` to `validateUrl()`, defaulting to `DEFAULT_DNS_TIMEOUT_MS` (5,000ms) when the caller sets none — `ssrf-guard@1.0.0`'s `validateUrl` has no timeout at all when both `signal` and `timeoutMs` are `undefined`, so a bare pass-through of an unset caller value would leave DNS resolution unbounded on the dominant production path. A DNS-phase timeout is classified as `CrawlerTimeoutError` (504 / `network_error: 'timeout'`), distinct from the DNS-failure and SSRF-rejection cases above.

   Resolver null-route answers (`::` or `0.0.0.0`) for hostnames are treated as DNS failures, not SSRF. They are recorded with `network_error: 'dns'` / `response_status_code: 502` and feed the hostname DNS-failure counter. Literal URLs to those addresses are still rejected by the synchronous SSRF checks.

> **DNS pinning**: `validateUrl()` returns the validated resolved addresses, which are passed through to `fetchWithTimeout()` as a cached pinned undici `Dispatcher`. This eliminates the TOCTOU window between the DNS safety check and the actual HTTP fetch while still reusing sockets for repeated requests to the same validated address set.
>
> RSS feed fetches use the same validation and pinned-dispatcher path. TLS certificate hostname mismatches after a pinned connect are treated as target-host configuration failures and count toward the hostname auto-disable counter.
>
> **Residual risk (browser crawl)**: The `crawl_browser` queue (worker-cpu) connects to
> Lightpanda's cloud browser over Playwright/CDP; the remote browser resolves DNS itself, so
> `crawlUrl`'s DNS-pinning approach does not apply. Mitigations:
> [`assertSafeUrlSync()`](../../../backend/services/browser-crawl/ssrf.mts) synchronously blocks
> disallowed schemes, private-IP literals, and `localhost`/`.local` hostnames on every subrequest via
> Playwright's `page.route()` interception, and on every page-initiated WebSocket dial via
> `page.routeWebSocket()` — an app-level layer atop Lightpanda cloud's own network-level blocking,
> matching the http(s) guard rather than replacing that delegation. DNS-rebinding protection for a
> hostname that only resolves to a private IP at request time is delegated to Lightpanda cloud's own
> private-network blocking; and only content extracted from the page (title, markdown, links, meta
> tags) — not the raw HTML — is persisted.
>
> Service Workers are blocked at the context level (`newContext({ serviceWorkers: 'block' })`) so a
> crawled page can never register one to bypass `page.route()`/`page.routeWebSocket()` interception —
> Playwright enforces this itself via a client-side init script, independent of whether Lightpanda
> implements Service Workers of its own.
>
> `page.routeWebSocket()` only sees dials from the page or an iframe; a page-created Dedicated/Shared
> Web Worker that dials its own WebSocket bypasses the app-level guard and falls back to Lightpanda
> cloud's network-level blocking alone. This is an inherent limit of Playwright's interception model,
> not something the app layer can close.

### Image Resize Sideloads

The image-resize Lambda validates sideload URL hosts with the same shared SSRF primitives. Redirect handling, per-hop re-validation, and DNS pinning are delegated to `safeFetch()` from `ssrf-guard/node`, which re-validates and repins each redirect hop with a 10-redirect limit.

### Shared modules

- [`ssrf-guard`](https://www.npmjs.com/package/ssrf-guard) (npm) — pure primitives: IP
  classification, hostname normalization, per-runtime blocked-host policy matching, and
  validation of already-resolved DNS addresses. IP classification includes legacy URL-parser
  IPv4 literal forms. No DNS lookup or runtime-specific error classes.
- `ssrf-guard/node` — Node.js entry point. Performs DNS resolution, unions the mandatory
  `localhost`/`.local` hostname baseline with any caller policy, returns `ResolvedSafeAddress[]`
  for pinning, and throws `UnsafeUrlError` for all SSRF failures. Also exports `safeFetch()`,
  which applies allowed-protocol policy, re-validation, and DNS pinning at every redirect hop.
- `validateUrl(url: string, options): Promise<ResolvedSafeAddress[]>` — async API;
  only calls `isPrivateIp` on IP literals and DNS-resolved addresses (not domain names).
  Returns validated addresses for DNS pinning. **`ssrf-guard@1.0.0`'s `validateUrl` has no DNS/SSRF
  resolution timeout at all unless the caller passes `signal` or `timeoutMs`** — every direct call
  site (the crawler's `safety.mts`, `fetch-remote-actor-document.mts`,
  `domain-verification-well-known.mts`, `deliver-activity.mts`, and `embed-resolver.mts`) passes an
  explicit `timeoutMs` (or a forwarded `signal`), typically 5,000ms (#10833; see [Runtime Timeouts
  classification](../../development/reference-runtime-timeouts-classification.md#hard-constraints-externalprotocol-driven)
  for the full table). This bounds only the caller's wait, not the underlying
  `dns.promises.lookup` call itself — a sustained black-holed-DNS target can still hold a libuv
  threadpool slot until Node's own DNS resolver times out, even though every caller above returns
  promptly. The import-provenance-aware Oxlint
  `no-mistakes/require-options-on-imported-call` rule enforces every `validateUrl` import from
  `ssrf-guard/node`, including aliased and namespace imports, has a second options argument
  containing `timeoutMs` or `signal`. The companion
  `ast-grep-rules/backend-validate-url-bounded-dns.yml` covers only `deps` and `dependencies`
  dependency-injection receivers that provenance analysis cannot resolve.

---

## Creation Gates

Account-age and identity gates prevent abuse from fresh accounts. They throw HTTP 403 and are enforced at the service layer on top of rate limiting. Administrators bypass all gates.

> **Note**: Accounts < 24h old are clamped to rate-limit tier 0 inside `computeTrustTier` — this is a rate-limiting adjustment, not a creation gate, and does not throw an error.

| Action                      | Gate                                            | HTTP status | Error code                    |
| --------------------------- | ----------------------------------------------- | ----------- | ----------------------------- |
| Vote                        | Verified non-disposable email unless paid/admin | 403         | `EMAIL_VERIFICATION_REQUIRED` |
| Create community            | Username required                               | 403         | `IDENTITY_REQUIRED`           |
| Create post/comment/rating  | Account must be ≥ 7d old unless paid/admin      | 403         | `CONTRIBUTION_GATED`          |
| Create post/comment/rating  | Verified non-disposable email unless paid/admin | 403         | `EMAIL_VERIFICATION_REQUIRED` |
| Create post/comment         | OAuth or username required                      | 403         | `IDENTITY_REQUIRED`           |
| Start identity verification | Verified email                                  | 403         | `EMAIL_VERIFICATION_REQUIRED` |

News and RSS discussion creation use the post gate. Paid and administrator contribution bypasses
remain unchanged. Clients recover from `EMAIL_VERIFICATION_REQUIRED` with email verification and
require the user to retry the interrupted action manually.

**Files:**

- `backend/services/contribution-gating/` — `assertCanContribute()`
- `backend/services/communities/authorization.mts` — `assertCanCreateCommunity()`
- `backend/services/posts/authorization.mts` — `currentUserCanCreatePost()`

---
