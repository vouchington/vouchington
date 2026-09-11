# Classification

[Back to Runtime Timeouts](runtime-timeouts.md#classification)

### Hard constraints (external/protocol-driven)

These bound a single external network call and are sized to the target's real latency profile —
lowering them risks spurious failures against a slow-but-healthy peer; raising them risks a hung
crawl/delivery holding a worker slot.

| Caller                                               | File                                                               | Constant                         | Value  |
| ---------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------- | ------ |
| HTML crawler — DNS/SSRF resolution                   | `backend/services/crawls/crawl-url/safety.mts`                     | `DEFAULT_DNS_TIMEOUT_MS`         | 5,000  |
| HTML crawler — request (to headers)                  | `backend/services/crawler-html/index.mts`                          | `DEFAULT_REQUEST_TIMEOUT_MS`     | 5,000  |
| HTML crawler — response body download                | `backend/services/crawler-html/index.mts`                          | `DEFAULT_RESPONSE_TIMEOUT_MS`    | 5,000  |
| HTML crawler — total redirect-chain cap              | `backend/services/crawls/crawl-url.mts`                            | `DEFAULT_TOTAL_CRAWL_TIMEOUT_MS` | 60,000 |
| RSS chapters fetch                                   | `backend/services/rss-feed-items/chapters.mts`                     | `CHAPTERS_FETCH_TIMEOUT_MS`      | 5,000  |
| Fediverse provider fetch                             | `backend/config/fediverse.mts`                                     | `FEDIVERSE_PROVIDER_TIMEOUT_MS`  | 4,000  |
| Fediverse search deadline                            | `backend/config/fediverse.mts`                                     | `FEDIVERSE_SEARCH_DEADLINE_MS`   | 5,000  |
| Fediverse NodeInfo budget                            | `backend/config/fediverse.mts`                                     | `FEDIVERSE_ADAPTER_BUDGET_MS`    | 4,500  |
| Domain verification — DNS/SSRF resolution            | `backend/services/topic-claims/domain-verification-well-known.mts` | `DNS_TIMEOUT_MS`                 | 5,000  |
| Domain verification well-known                       | `backend/services/topic-claims/domain-verification-well-known.mts` | `FETCH_TIMEOUT_MS`               | 10,000 |
| Wikipedia API                                        | `backend/modules/wikipedia-api/api.mts`                            | `REQUEST_TIMEOUT_MS`             | 10,000 |
| robots.txt                                           | `backend/services/urls-domains-robots/index.mts`                   | `FETCH_TIMEOUT_MS`               | 10,000 |
| Remote ActivityPub actor fetch — DNS/SSRF resolution | `backend/services/remote-actors/fetch-remote-actor-document.mts`   | `DNS_TIMEOUT_MS`                 | 5,000  |
| Remote ActivityPub actor fetch                       | `backend/services/remote-actors/fetch-remote-actor-document.mts`   | `FETCH_TIMEOUT_MS`               | 10,000 |
| ActivityPub delivery — DNS/SSRF resolution           | `backend/services/activitypub-delivery/deliver-activity.mts`       | `DNS_TIMEOUT_MS`                 | 5,000  |
| ActivityPub delivery                                 | `backend/services/activitypub-delivery/deliver-activity.mts`       | `DELIVERY_TIMEOUT_MS`            | 10,000 |
| Embed resolver — DNS/SSRF resolution                 | `backend/services/crawl-embeds/embed-resolver.mts`                 | `DNS_TIMEOUT_MS`                 | 5,000  |
| Embed resolver — total fetch budget                  | `backend/services/crawl-embeds/embed-resolver.mts`                 | `EMBED_FETCH_TIMEOUT_MS`         | 5,000  |
| Kagi Smallweb feed list                              | `backend/services/kagi-smallweb/fetch-feed-list.mts`               | `FETCH_TIMEOUT_MS`               | 30,000 |

**HTML crawler phase budgets are independent, not shared or divided** (#10772): DNS/SSRF
resolution, the request-to-headers phase, and the response-body download each get their own timer,
and each redirect hop re-arms all three. `DEFAULT_TOTAL_CRAWL_TIMEOUT_MS` is the one value that
does **not** reset per hop — `crawlUrl` stamps an absolute `deadlineAt` on the first hop only and
forwards it verbatim through every recursive redirect call, so a long hop chain still terminates in
bounded total time even though each hop's own DNS/request/response budgets are fresh. See
`backend/services/crawls/crawl-url/types.mts`'s `CrawlUrlOptions` doc comments for the exact
plumbing. `backend/modules/utils/http.mts`'s shared `isTimeoutError` predicate classifies both
timeout shapes seen on this path: `AbortSignal.timeout()` aborts `fetch` with a `DOMException`
named `TimeoutError`, while an aborted body-read `stream.pipeline()` rejects with an `Error` named
`AbortError`.

**`validateUrl()` (`ssrf-guard/node`) has no DNS/SSRF resolution timeout unless a caller passes
`signal` or `timeoutMs`** (#10833) — every call site above now passes an explicit `DNS_TIMEOUT_MS`,
mirroring the crawler's own `DEFAULT_DNS_TIMEOUT_MS`. This bounds only the caller's wait: the
underlying `dns.promises.lookup` keeps running and can still hold a libuv threadpool slot until it
resolves or the process's DNS resolver itself times out, so a sustained black-holed-DNS target can
still exhaust threadpool capacity even though every caller returns promptly. The embed resolver's
`DNS_TIMEOUT_MS` is a second, independent budget from `EMBED_FETCH_TIMEOUT_MS` for the resolution
phase specifically, matching the per-phase model above; it also now forwards the caller's live
`AbortSignal` into `validateUrl()` instead of silently dropping it. The domain-verification well-known
row above previously implied a single `FETCH_TIMEOUT_MS` bounded the whole request; DNS/SSRF
resolution is a separate, independently-bounded phase that runs before it, same as every other row.
The import-provenance-aware Oxlint `no-mistakes/require-options-on-imported-call` rule enforces
every `validateUrl` import from `ssrf-guard/node`, including aliased and namespace imports, has a
second options argument containing `timeoutMs` or `signal`. The companion
`ast-grep-rules/backend-validate-url-bounded-dns.yml` covers only the `deps` and `dependencies`
dependency-injection receivers that provenance analysis cannot resolve.
